import { getContainer } from '@cloudflare/containers'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { Address, Hex } from 'ox'
import { type Chain, createPublicClient, http, keccak256 } from 'viem'

import {
	getVyperAuxdataStyle,
	getVyperImmutableReferences,
	type ImmutableReferences,
	type LinkReferences,
	matchBytecode,
} from '#bytecode-matching.ts'
import { chains, DEVNET_CHAIN_ID, TESTNET_CHAIN_ID } from '#chains.ts'

import {
	codeTable,
	compiledContractsSignaturesTable,
	compiledContractsSourcesTable,
	compiledContractsTable,
	contractDeploymentsTable,
	contractsTable,
	type SignatureType,
	signaturesTable,
	sourcesTable,
	verifiedContractsTable,
} from '#database/schema.ts'
import { normalizeSourcePath, sourcifyError } from '#utilities.ts'

/**
 * Legacy Sourcify-compatible routes for Foundry forge verify.
 *
 * POST /verify - Solidity verification
 * POST /verify/vyper - Vyper verification
 */

const legacyVerifyRoute = new Hono<{ Bindings: Cloudflare.Env }>()

legacyVerifyRoute.use(
	'*',
	bodyLimit({
		maxSize: 2 * 1024 * 1024, // 2mb
		onError: (context) => {
			const message = `[requestId: ${context.req.header('X-Tempo-Request-Id')}] Body limit exceeded`
			console.error(message)
			return sourcifyError(context, 413, 'body_too_large', message)
		},
	}),
)

interface LegacyVyperRequest {
	address: string
	chain: string
	files: Record<string, string>
	contractPath: string
	contractName: string
	compilerVersion: string
	compilerSettings?: object
	creatorTxHash?: string
}

// POST /verify/vyper - Legacy Sourcify Vyper verification (used by Foundry)
legacyVerifyRoute.post('/vyper', async (context) => {
	try {
		const body = (await context.req.json()) as LegacyVyperRequest

		console.log('[verify/vyper] Request body:', JSON.stringify(body, null, 2))

		const {
			address,
			chain,
			files,
			contractPath,
			contractName,
			compilerVersion,
			compilerSettings,
		} = body

		const chainId = Number(chain)
		if (![DEVNET_CHAIN_ID, TESTNET_CHAIN_ID].includes(chainId)) {
			return sourcifyError(
				context,
				400,
				'unsupported_chain',
				`The chain with chainId ${chainId} is not supported`,
			)
		}

		if (!Address.validate(address, { strict: true })) {
			return sourcifyError(
				context,
				400,
				'invalid_address',
				`Invalid address: ${address}`,
			)
		}

		if (!files || Object.keys(files).length === 0) {
			return sourcifyError(
				context,
				400,
				'missing_files',
				'No source files provided',
			)
		}

		if (!contractPath || !contractName || !compilerVersion) {
			return sourcifyError(
				context,
				400,
				'missing_params',
				'contractPath, contractName, and compilerVersion are required',
			)
		}

		// Check if already verified
		const db = drizzle(context.env.CONTRACTS_DB)
		const addressBytes = Hex.toBytes(address as `0x${string}`)

		const existingVerification = await db
			.select({
				matchId: verifiedContractsTable.id,
			})
			.from(verifiedContractsTable)
			.innerJoin(
				contractDeploymentsTable,
				eq(verifiedContractsTable.deploymentId, contractDeploymentsTable.id),
			)
			.where(
				and(
					eq(contractDeploymentsTable.chainId, chainId),
					eq(contractDeploymentsTable.address, addressBytes),
				),
			)
			.limit(1)

		if (existingVerification.length > 0) {
			return context.json({
				result: [{ address, chainId: chain, status: 'perfect' }],
			})
		}

		const chainConfig = chains[
			chainId as keyof typeof chains
		] as unknown as Chain
		const client = createPublicClient({
			chain: chainConfig,
			transport: http(
				chainConfig.id === TESTNET_CHAIN_ID
					? 'https://rpc.testnet.tempo.xyz'
					: undefined,
			),
		})

		const onchainBytecode = await client.getCode({
			address: address as `0x${string}`,
		})
		if (!onchainBytecode || onchainBytecode === '0x') {
			return context.json({
				result: [
					{
						address,
						chainId: chain,
						status: 'null',
						message: `Chain #${chainId} does not have a contract deployed at ${address}`,
					},
				],
			})
		}

		// Convert legacy format to standard JSON input
		const sources: Record<string, { content: string }> = {}
		for (const [path, content] of Object.entries(files)) {
			sources[path] = { content }
		}

		const stdJsonInput = {
			language: 'Vyper',
			sources,
			settings: compilerSettings ?? {
				outputSelection: {
					'*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'],
				},
			},
		}

		// Compile via container
		const container = getContainer(
			context.env.VERIFICATION_CONTAINER,
			'singleton',
		)

		const compileResponse = await container.fetch(
			new Request('http://container/compile/vyper', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					compilerVersion,
					input: stdJsonInput,
				}),
			}),
		)

		if (!compileResponse.ok) {
			const errorText = await compileResponse.text()
			return sourcifyError(context, 500, 'compilation_failed', errorText)
		}

		const compileOutput = (await compileResponse.json()) as {
			contracts?: Record<
				string,
				Record<
					string,
					{
						abi: Array<{
							type: string
							name?: string
							inputs?: Array<{ type: string; name?: string }>
						}>
						evm: {
							bytecode: {
								object: string
								linkReferences?: LinkReferences
								sourceMap?: string
							}
							deployedBytecode: {
								object: string
								linkReferences?: LinkReferences
								immutableReferences?: ImmutableReferences
								sourceMap?: string
							}
						}
						metadata?: string
						storageLayout?: unknown
						userdoc?: unknown
						devdoc?: unknown
					}
				>
			>
			errors?: Array<{
				severity: string
				message: string
				formattedMessage?: string
			}>
		}

		const errors =
			compileOutput.errors?.filter((e) => e.severity === 'error') ?? []
		if (errors.length > 0) {
			return sourcifyError(
				context,
				400,
				'compilation_error',
				errors.map((e) => e.formattedMessage ?? e.message).join('\n'),
			)
		}

		console.log(
			'[verify/vyper] Compile output contracts:',
			JSON.stringify(Object.keys(compileOutput.contracts ?? {})),
		)
		console.log('[verify/vyper] Looking for:', contractPath, contractName)

		// Get compiled bytecode for the target contract
		const compiledContract =
			compileOutput.contracts?.[contractPath]?.[contractName]
		if (!compiledContract) {
			console.log(
				'[verify/vyper] Available in path:',
				compileOutput.contracts?.[contractPath]
					? Object.keys(compileOutput.contracts[contractPath])
					: 'path not found',
			)
			return sourcifyError(
				context,
				400,
				'contract_not_found_in_output',
				`Could not find ${contractName} in ${contractPath}`,
			)
		}

		const compiledBytecode = `0x${compiledContract.evm.deployedBytecode.object}`
		const creationBytecodeRaw = `0x${compiledContract.evm.bytecode.object}`

		const auxdataStyle = getVyperAuxdataStyle(compilerVersion)

		const immutableReferences = getVyperImmutableReferences(
			compilerVersion,
			creationBytecodeRaw,
			compiledBytecode,
		)

		const runtimeMatchResult = matchBytecode({
			onchainBytecode: onchainBytecode,
			recompiledBytecode: compiledBytecode,
			isCreation: false,
			linkReferences: undefined,
			immutableReferences,
			auxdataStyle,
			abi: compiledContract.abi,
		})

		if (runtimeMatchResult.match === null) {
			return context.json(
				{
					error:
						runtimeMatchResult.message ||
						"The deployed and recompiled bytecode don't match.",
				},
				500,
			)
		}

		const isExactMatch = runtimeMatchResult.match === 'exact_match'
		const auditUser = 'verification-api'
		const contractIdentifier = `${contractPath}:${contractName}`

		// Compute hashes for runtime bytecode
		const runtimeBytecodeBytes = Hex.toBytes(compiledBytecode as `0x${string}`)
		const runtimeCodeHashSha256 = new Uint8Array(
			await globalThis.crypto.subtle.digest(
				'SHA-256',
				new TextEncoder().encode(compiledBytecode as `0x${string}`),
			),
		)
		const runtimeCodeHashKeccak = Hex.toBytes(
			keccak256(compiledBytecode as `0x${string}`),
		)

		// Compute hashes for creation bytecode
		const creationBytecode = `0x${compiledContract.evm.bytecode.object}`
		const creationBytecodeBytes = Hex.toBytes(creationBytecode as `0x${string}`)
		const creationCodeHashSha256 = new Uint8Array(
			await globalThis.crypto.subtle.digest(
				'SHA-256',
				new TextEncoder().encode(creationBytecode as `0x${string}`),
			),
		)
		const creationCodeHashKeccak = Hex.toBytes(
			keccak256(creationBytecode as `0x${string}`),
		)

		// Insert runtime code
		await db
			.insert(codeTable)
			.values({
				codeHash: runtimeCodeHashSha256,
				codeHashKeccak: runtimeCodeHashKeccak,
				code: runtimeBytecodeBytes,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
			.onConflictDoNothing()

		// Insert creation code
		await db
			.insert(codeTable)
			.values({
				codeHash: creationCodeHashSha256,
				codeHashKeccak: creationCodeHashKeccak,
				code: creationBytecodeBytes,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
			.onConflictDoNothing()

		// Get or create contract
		const existingContract = await db
			.select({ id: contractsTable.id })
			.from(contractsTable)
			.where(eq(contractsTable.runtimeCodeHash, runtimeCodeHashSha256))
			.limit(1)

		let contractId: string
		if (existingContract.length > 0 && existingContract[0]) {
			contractId = existingContract[0].id
		} else {
			contractId = globalThis.crypto.randomUUID()
			await db.insert(contractsTable).values({
				id: contractId,
				creationCodeHash: creationCodeHashSha256,
				runtimeCodeHash: runtimeCodeHashSha256,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
		}

		// Get or create deployment
		const existingDeployment = await db
			.select({ id: contractDeploymentsTable.id })
			.from(contractDeploymentsTable)
			.where(
				and(
					eq(contractDeploymentsTable.chainId, chainId),
					eq(contractDeploymentsTable.address, addressBytes),
				),
			)
			.limit(1)

		let deploymentId: string
		if (existingDeployment.length > 0 && existingDeployment[0]) {
			deploymentId = existingDeployment[0].id
		} else {
			deploymentId = globalThis.crypto.randomUUID()
			await db.insert(contractDeploymentsTable).values({
				id: deploymentId,
				chainId: chainId,
				address: addressBytes,
				contractId,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
		}

		// Get or create compiled contract
		const existingCompilation = await db
			.select({ id: compiledContractsTable.id })
			.from(compiledContractsTable)
			.where(
				and(
					eq(compiledContractsTable.runtimeCodeHash, runtimeCodeHashSha256),
					eq(compiledContractsTable.compiler, 'vyper'),
					eq(compiledContractsTable.version, compilerVersion),
				),
			)
			.limit(1)

		let compilationId: string
		if (existingCompilation.length > 0 && existingCompilation[0]) {
			compilationId = existingCompilation[0].id
		} else {
			compilationId = globalThis.crypto.randomUUID()

			const creationCodeArtifacts = {
				sourceMap: compiledContract.evm.bytecode.sourceMap,
			}
			const runtimeCodeArtifacts = {
				sourceMap: compiledContract.evm.deployedBytecode.sourceMap,
				immutableReferences,
			}
			const compilationArtifacts = {
				abi: compiledContract.abi,
				metadata: compiledContract.metadata,
				storageLayout: compiledContract.storageLayout,
				userdoc: compiledContract.userdoc,
				devdoc: compiledContract.devdoc,
			}

			await db.insert(compiledContractsTable).values({
				id: compilationId,
				compiler: 'vyper',
				version: compilerVersion,
				language: 'Vyper',
				name: contractName,
				fullyQualifiedName: contractIdentifier,
				compilerSettings: JSON.stringify(stdJsonInput.settings),
				compilationArtifacts: JSON.stringify(compilationArtifacts),
				creationCodeHash: creationCodeHashSha256,
				creationCodeArtifacts: JSON.stringify(creationCodeArtifacts),
				runtimeCodeHash: runtimeCodeHashSha256,
				runtimeCodeArtifacts: JSON.stringify(runtimeCodeArtifacts),
				createdBy: auditUser,
				updatedBy: auditUser,
			})
		}

		// Insert sources
		for (const [sourcePath, sourceContent] of Object.entries(files)) {
			const contentBytes = new TextEncoder().encode(sourceContent)
			const sourceHashSha256 = new Uint8Array(
				await globalThis.crypto.subtle.digest('SHA-256', contentBytes),
			)
			const sourceHashKeccak = Hex.toBytes(
				keccak256(Hex.fromBytes(contentBytes)),
			)

			await db
				.insert(sourcesTable)
				.values({
					sourceHash: sourceHashSha256,
					sourceHashKeccak: sourceHashKeccak,
					content: sourceContent,
					createdBy: auditUser,
					updatedBy: auditUser,
				})
				.onConflictDoNothing()

			// Normalize path (convert absolute to relative)
			const normalizedPath = normalizeSourcePath(sourcePath)
			await db
				.insert(compiledContractsSourcesTable)
				.values({
					id: globalThis.crypto.randomUUID(),
					compilationId: compilationId,
					sourceHash: sourceHashSha256,
					path: normalizedPath,
				})
				.onConflictDoNothing()
		}

		// Extract and insert signatures from ABI
		const abi = compiledContract.abi
		for (const item of abi) {
			let signatureType: SignatureType | null = null
			if (item.type === 'function') signatureType = 'function'
			else if (item.type === 'event') signatureType = 'event'
			else if (item.type === 'error') signatureType = 'error'

			if (signatureType && item.name) {
				const inputTypes = (item.inputs ?? []).map((i) => i.type).join(',')
				const signature = `${item.name}(${inputTypes})`
				const signatureHash32 = Hex.toBytes(
					keccak256(Hex.fromString(signature)),
				)

				await db
					.insert(signaturesTable)
					.values({ signatureHash32, signature })
					.onConflictDoNothing()

				await db
					.insert(compiledContractsSignaturesTable)
					.values({
						id: globalThis.crypto.randomUUID(),
						compilationId,
						signatureHash32,
						signatureType,
					})
					.onConflictDoNothing()
			}
		}

		// Insert verified contract
		await db
			.insert(verifiedContractsTable)
			.values({
				deploymentId,
				compilationId,
				creationMatch: false,
				runtimeMatch: true,
				runtimeMetadataMatch: isExactMatch,
				runtimeValues:
					Object.keys(runtimeMatchResult.transformationValues).length > 0
						? JSON.stringify(runtimeMatchResult.transformationValues)
						: null,
				runtimeTransformations:
					runtimeMatchResult.transformations.length > 0
						? JSON.stringify(runtimeMatchResult.transformations)
						: null,
				createdBy: auditUser,
				updatedBy: auditUser,
			})
			.onConflictDoNothing()

		// Return legacy Sourcify format
		return context.json({
			result: [
				{
					address,
					chainId: chain,
					status: isExactMatch ? 'perfect' : 'partial',
				},
			],
		})
	} catch (error) {
		console.error(error)
		return context.json({ error: 'An unexpected error occurred' }, 500)
	}
})

export { legacyVerifyRoute }
