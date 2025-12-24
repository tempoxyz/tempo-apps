import { getContainer } from '@cloudflare/containers'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { Address, Hex } from 'ox'
import { type Chain, createPublicClient, http, keccak256 } from 'viem'

import {
	AuxdataStyle,
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
 * TODO:
 * - handle different solc versions
 * - routes:
 *   - /metadata/:chainId/:address
 *   - /similarity/:chainId/:address
 *   - /:verificationId
 */

/**
 * /verify:
 *
 * POST /v2/verify/{chainId}/{address}
 * POST /v2/verify/metadata/{chainId}/{address}
 * POST /v2/verify/similarity/{chainId}/{address}
 * GET  /v2/verify/{verificationId}
 *
 * (deprecated ones but still supported by foundry forge):
 *
 * POST /verify
 * POST /verify/vyper
 * POST /verify/etherscan
 * POST /verify/solc-json
 */

const verifyRoute = new Hono<{ Bindings: Cloudflare.Env }>()

verifyRoute.use(
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

// POST /v2/verify/metadata/:chainId/:address - Verify Contract (using Solidity metadata.json)
verifyRoute.post('/metadata/:chainId/:address', (context) =>
	sourcifyError(
		context,
		501,
		'not_implemented',
		'Metadata-based verification is not implemented',
	),
)

// POST /v2/verify/similarity/:chainId/:address - Verify contract via similarity search
verifyRoute.post('/similarity/:chainId/:address', (context) =>
	sourcifyError(
		context,
		501,
		'not_implemented',
		'Similarity-based verification is not implemented',
	),
)

// POST /v2/verify/:chainId/:address - Verify Contract (Standard JSON)
verifyRoute.post('/:chainId/:address', async (context) => {
	try {
		const { chainId: _chainId, address } = context.req.param()
		const body = (await context.req.json()) as {
			stdJsonInput: {
				language: string
				sources: Record<string, { content: string }>
				settings: object
			}
			compilerVersion: string
			contractIdentifier: string // e.g., "contracts/Token.sol:Token"
			creationTransactionHash?: string
		}

		const chainId = Number(_chainId)
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

		if (
			!Object.hasOwn(body, 'stdJsonInput') ||
			!Object.hasOwn(body, 'compilerVersion') ||
			!Object.hasOwn(body, 'contractIdentifier')
		) {
			return sourcifyError(
				context,
				400,
				'missing_params',
				'stdJsonInput, compilerVersion, and contractIdentifier are required',
			)
		}

		const { stdJsonInput, compilerVersion, contractIdentifier } = body

		// Detect language from stdJsonInput
		const language = stdJsonInput.language?.toLowerCase() ?? 'solidity'
		const isVyper = language === 'vyper'

		// Parse contractIdentifier: "contracts/Token.sol:Token" -> { path: "contracts/Token.sol", name: "Token" }
		const lastColonIndex = contractIdentifier.lastIndexOf(':')
		if (lastColonIndex === -1) {
			return sourcifyError(
				context,
				400,
				'invalid_contract_identifier',
				'contractIdentifier must be in format "path/to/Contract.sol:ContractName"',
			)
		}
		const contractPath = contractIdentifier.slice(0, lastColonIndex)
		const contractName = contractIdentifier.slice(lastColonIndex + 1)

		// Check if already verified
		const db = drizzle(context.env.CONTRACTS_DB)
		const addressBytes = Hex.toBytes(address)

		const existingVerification = await db
			.select({
				matchId: verifiedContractsTable.id,
				verifiedAt: verifiedContractsTable.createdAt,
				runtimeMatch: verifiedContractsTable.runtimeMatch,
				runtimeMetadataMatch: verifiedContractsTable.runtimeMetadataMatch,
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
			return context.json(
				{ verificationId: existingVerification.at(0)?.matchId?.toString() },
				202,
			)
		}

		const chain = chains[chainId as keyof typeof chains] as unknown as Chain
		const client = createPublicClient({
			chain,
			transport: http(
				chain.id === TESTNET_CHAIN_ID
					? 'https://rpc.testnet.tempo.xyz'
					: undefined,
			),
		})

		const onchainBytecode = await client.getCode({ address: address })
		if (!onchainBytecode || onchainBytecode === '0x') {
			return sourcifyError(
				context,
				404,
				'contract_not_found',
				`No bytecode found at address ${address} on chain ${chainId}`,
			)
		}

		// Step 2: Compile via container
		const container = getContainer(
			context.env.VERIFICATION_CONTAINER,
			'singleton',
		)

		// Route to appropriate compiler endpoint based on language
		const compileEndpoint = isVyper
			? 'http://container/compile/vyper'
			: 'http://container/compile'

		const compileResponse = await container.fetch(
			new Request(compileEndpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					compilerVersion,
					contractIdentifier,
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

		// Step 3: Get compiled bytecode for the target contract
		// Try exact path first, then try matching by suffix (for Vyper absolute paths)
		let compiledContract =
			compileOutput.contracts?.[contractPath]?.[contractName]
		let _matchedPath = contractPath

		if (!compiledContract && compileOutput.contracts) {
			for (const outputPath of Object.keys(compileOutput.contracts)) {
				if (
					outputPath.endsWith(contractPath) ||
					outputPath.endsWith(`/${contractPath}`)
				) {
					compiledContract = compileOutput.contracts[outputPath]?.[contractName]
					_matchedPath = outputPath
					if (compiledContract) break
				}
			}
		}

		if (!compiledContract) {
			return sourcifyError(
				context,
				400,
				'contract_not_found_in_output',
				`Could not find ${contractName} in ${contractPath}`,
			)
		}

		const deployedObject = compiledContract.evm.deployedBytecode.object
		const bytecodeObject = compiledContract.evm.bytecode.object
		const compiledBytecode = deployedObject.startsWith('0x')
			? deployedObject
			: `0x${deployedObject}`
		const creationBytecodeRaw = bytecodeObject.startsWith('0x')
			? bytecodeObject
			: `0x${bytecodeObject}`

		// Step 4: Compare bytecodes using proper matching with transformations
		// For Vyper, we need to compute immutable references from auxdata
		const auxdataStyle = isVyper
			? getVyperAuxdataStyle(compilerVersion)
			: AuxdataStyle.SOLIDITY

		// Vyper doesn't provide immutableReferences in compiler output, we compute them from auxdata
		const immutableReferences = isVyper
			? getVyperImmutableReferences(
					compilerVersion,
					creationBytecodeRaw,
					compiledBytecode,
				)
			: compiledContract.evm.deployedBytecode.immutableReferences

		// Vyper doesn't support libraries
		const linkReferences = isVyper
			? undefined
			: compiledContract.evm.deployedBytecode.linkReferences

		const runtimeMatchResult = matchBytecode({
			onchainBytecode: onchainBytecode,
			recompiledBytecode: compiledBytecode,
			isCreation: false,
			linkReferences,
			immutableReferences,
			auxdataStyle,
			abi: compiledContract.abi,
		})

		if (runtimeMatchResult.match === null) {
			return sourcifyError(
				context,
				400,
				'no_match',
				runtimeMatchResult.message ||
					'Compiled bytecode does not match on-chain bytecode',
			)
		}

		const isExactMatch = runtimeMatchResult.match === 'exact_match'

		const auditUser = 'verification-api'

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

		// Compute hashes for creation bytecode (reuse creationBytecodeRaw which already handles 0x prefix)
		const creationBytecode = creationBytecodeRaw
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

		// Insert runtime code (ignore if already exists)
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

		// Insert creation code (ignore if already exists)
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
		const compilerName = isVyper ? 'vyper' : 'solc'
		const existingCompilation = await db
			.select({ id: compiledContractsTable.id })
			.from(compiledContractsTable)
			.where(
				and(
					eq(compiledContractsTable.runtimeCodeHash, runtimeCodeHashSha256),
					eq(compiledContractsTable.compiler, compilerName),
					eq(compiledContractsTable.version, body.compilerVersion),
				),
			)
			.limit(1)

		let compilationId: string
		if (existingCompilation.length > 0 && existingCompilation[0]) {
			compilationId = existingCompilation[0].id
		} else {
			compilationId = globalThis.crypto.randomUUID()

			// Build code artifacts from compiler output
			const creationCodeArtifacts = {
				sourceMap: compiledContract.evm.bytecode.sourceMap,
				linkReferences: isVyper
					? undefined
					: compiledContract.evm.bytecode.linkReferences,
			}
			const runtimeCodeArtifacts = {
				sourceMap: compiledContract.evm.deployedBytecode.sourceMap,
				linkReferences,
				immutableReferences,
			}

			// Build compilation artifacts (ABI, docs, storage layout)
			const compilationArtifacts = {
				abi: compiledContract.abi,
				metadata: compiledContract.metadata,
				storageLayout: compiledContract.storageLayout,
				userdoc: compiledContract.userdoc,
				devdoc: compiledContract.devdoc,
			}

			await db.insert(compiledContractsTable).values({
				id: compilationId,
				compiler: compilerName,
				version: body.compilerVersion,
				language: stdJsonInput.language,
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

		// Insert sources and link them to the compilation (always, even for existing compilations)
		for (const [sourcePath, sourceData] of Object.entries(
			stdJsonInput.sources,
		)) {
			const content = sourceData.content
			const contentBytes = new TextEncoder().encode(content)
			const sourceHashSha256 = new Uint8Array(
				await globalThis.crypto.subtle.digest('SHA-256', contentBytes),
			)
			const sourceHashKeccak = Hex.toBytes(
				keccak256(Hex.fromBytes(contentBytes)),
			)

			// Insert source (ignore if already exists)
			await db
				.insert(sourcesTable)
				.values({
					sourceHash: sourceHashSha256,
					sourceHashKeccak: sourceHashKeccak,
					content: content,
					createdBy: auditUser,
					updatedBy: auditUser,
				})
				.onConflictDoNothing()

			// Link source to compilation with normalized path (convert absolute to relative)
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

				// Insert signature (ignore if exists)
				await db
					.insert(signaturesTable)
					.values({
						signatureHash32: signatureHash32,
						signature: signature,
					})
					.onConflictDoNothing()

				// Link signature to compilation
				await db
					.insert(compiledContractsSignaturesTable)
					.values({
						id: globalThis.crypto.randomUUID(),
						compilationId: compilationId,
						signatureHash32: signatureHash32,
						signatureType: signatureType,
					})
					.onConflictDoNothing()
			}
		}

		// Insert verified contract with transformation data
		await db
			.insert(verifiedContractsTable)
			.values({
				deploymentId,
				compilationId,
				creationMatch: false, // We only verified runtime bytecode
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

		const verificationResult = await db
			.select({ id: verifiedContractsTable.id })
			.from(verifiedContractsTable)
			.where(eq(verifiedContractsTable.deploymentId, deploymentId))
			.limit(1)

		const verificationId =
			verificationResult.at(0)?.id?.toString() ?? globalThis.crypto.randomUUID()

		return context.json({ verificationId }, 202)
	} catch (error) {
		console.error(error)
		return sourcifyError(
			context,
			500,
			'internal_error',
			'An unexpected error occurred',
		)
	}
})

// GET /v2/verify/:verificationId - Check verification job status
verifyRoute.get('/:verificationId', async (context) => {
	try {
		const { verificationId } = context.req.param()

		const db = drizzle(context.env.CONTRACTS_DB)

		const result = await db
			.select({
				matchId: verifiedContractsTable.id,
				verifiedAt: verifiedContractsTable.createdAt,
				runtimeMatch: verifiedContractsTable.runtimeMatch,
				creationMatch: verifiedContractsTable.creationMatch,
				runtimeMetadataMatch: verifiedContractsTable.runtimeMetadataMatch,
				chainId: contractDeploymentsTable.chainId,
				address: contractDeploymentsTable.address,
				contractName: compiledContractsTable.name,
			})
			.from(verifiedContractsTable)
			.innerJoin(
				contractDeploymentsTable,
				eq(verifiedContractsTable.deploymentId, contractDeploymentsTable.id),
			)
			.innerJoin(
				compiledContractsTable,
				eq(verifiedContractsTable.compilationId, compiledContractsTable.id),
			)
			.where(eq(verifiedContractsTable.id, Number(verificationId)))
			.limit(1)

		if (result.length === 0 || !result[0]) {
			return context.json(
				{
					customCode: 'not_found',
					message: `No verification job found for ID ${verificationId}`,
					errorId: globalThis.crypto.randomUUID(),
				},
				404,
			)
		}

		const [v] = result
		const runtimeMatchStatus = v.runtimeMetadataMatch ? 'exact_match' : 'match'
		const creationMatchStatus = v.creationMatch ? 'exact_match' : 'match'

		// Foundry expects this format for completed jobs
		return context.json({
			isJobCompleted: true,
			contract: {
				match: runtimeMatchStatus,
				creationMatch: creationMatchStatus,
				runtimeMatch: runtimeMatchStatus,
				chainId: v.chainId,
				address: Hex.fromBytes(new Uint8Array(v.address as ArrayBuffer)),
				name: v.contractName,
				verifiedAt: v.verifiedAt,
			},
		})
	} catch (error) {
		console.error(error)
		return context.json(
			{
				customCode: 'internal_error',
				message: 'An unexpected error occurred',
				errorId: globalThis.crypto.randomUUID(),
			},
			500,
		)
	}
})

export { verifyRoute }
