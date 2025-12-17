import crypto from 'node:crypto'
import { getContainer } from '@cloudflare/containers'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { Address, Hex } from 'ox'
import { type Chain, createPublicClient, http, keccak256 } from 'viem'

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

/**
 * TODO:
 * - handle different solc versions
 * - support vyper
 * - routes:
 *   - /metadata/:chainId/:address
 *   - /similarity/:chainId/:address
 *   - /:verificationId
 * - - /:verificationId
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
			const message = `[requestId: ${context.req.header('Tempo-Request-Id')}] Body limit exceeded`

			console.error(message)
			return context.json({ error: message }, 413)
		},
	}),
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
			return context.json(
				{
					error: 'Invalid chainId',
					message: `Invalid chainId: ${chainId}`,
					errorId: crypto.randomUUID(),
				},
				400,
			)
		}

		if (!Address.validate(address, { strict: true })) {
			return context.json(
				{
					error: 'Invalid address',
					message: `Invalid address: ${address}`,
					errorId: crypto.randomUUID(),
				},
				400,
			)
		}

		if (
			!Object.hasOwn(body, 'stdJsonInput') ||
			!Object.hasOwn(body, 'compilerVersion') ||
			!Object.hasOwn(body, 'contractIdentifier')
		) {
			return context.json(
				{
					error: 'Missing required fields',
					message:
						'stdJsonInput, compilerVersion, and contractIdentifier are required',
					errorId: crypto.randomUUID(),
				},
				400,
			)
		}

		const { stdJsonInput, compilerVersion, contractIdentifier } = body

		// Parse contractIdentifier: "contracts/Token.sol:Token" -> { path: "contracts/Token.sol", name: "Token" }
		const lastColonIndex = contractIdentifier.lastIndexOf(':')
		if (lastColonIndex === -1) {
			return context.json(
				{
					error: 'Invalid contractIdentifier',
					message:
						'contractIdentifier must be in format "path/to/Contract.sol:ContractName"',
					errorId: crypto.randomUUID(),
				},
				400,
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

		if (existingVerification.length > 0 && existingVerification[0]) {
			const [v] = existingVerification
			const matchStatus = v.runtimeMetadataMatch ? 'exact_match' : 'match'

			return context.json(
				{
					verificationId: v.matchId,
					address,
					match: matchStatus,
					creationMatch: null,
					verifiedAt: v.verifiedAt,
					status: 'already_verified',
					runtimeMatch: matchStatus,
					matchId: v.matchId,
					chainId: chainId,
				},
				202,
			)
		}

		const chain = chains[chainId as keyof typeof chains] as unknown as Chain
		const client = createPublicClient({
			chain,
			transport: http('https://rpc.testnet.tempo.xyz'),
		})

		const onchainBytecode = await client.getCode({ address: address })
		if (!Hex.validate(onchainBytecode)) {
			return context.json(
				{
					error: 'Contract not found',
					message: `No bytecode found at address ${address} on chain ${chainId}`,
					errorId: crypto.randomUUID(),
				},
				404,
			)
		}

		// Step 2: Compile via container
		const container = getContainer(
			context.env.VERIFICATION_CONTAINER,
			'singleton',
		)

		const compileResponse = await container.fetch(
			new Request('http://container/compile', {
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
			const error = await compileResponse.text()
			return context.json(
				{
					error: 'Compilation failed',
					message: error,
					errorId: crypto.randomUUID(),
				},
				500,
			)
		}

		const compileOutput = (await compileResponse.json()) as {
			contracts?: Record<
				string,
				Record<
					string,
					{
						abi: unknown[]
						evm: {
							bytecode: { object: string }
							deployedBytecode: { object: string }
						}
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
			return context.json(
				{
					error: 'Compilation errors',
					message: errors
						.map((e) => e.formattedMessage ?? e.message)
						.join('\n'),
					errorId: crypto.randomUUID(),
				},
				400,
			)
		}

		// Step 3: Get compiled bytecode for the target contract
		const compiledContract =
			compileOutput.contracts?.[contractPath]?.[contractName]
		if (!compiledContract) {
			return context.json(
				{
					error: 'Contract not found in compilation output',
					message: `Could not find ${contractName} in ${contractPath}`,
					errorId: crypto.randomUUID(),
				},
				400,
			)
		}

		const compiledBytecode = `0x${compiledContract.evm.deployedBytecode.object}`

		// Step 4: Compare bytecodes
		// Note: This is a simplified comparison. Real verification needs to handle:
		// - Constructor arguments (appended to creation bytecode)
		// - Immutable variables
		// - Metadata hash differences (partial vs perfect match)
		// - CBOR-encoded metadata at the end of bytecode

		// Strip metadata hash for comparison (last 43 bytes typically contain CBOR metadata)
		// Format: 0xa2 0x64 'i' 'p' 'f' 's' ... (IPFS hash) ... 0x64 's' 'o' 'l' 'c' ... (solc version)
		const stripMetadata = (bytecode: string) => {
			// Find CBOR metadata marker (0xa2 or 0xa1 near the end)
			const code = bytecode.toLowerCase()
			// Look for common metadata patterns - this is simplified
			// Real implementation should properly decode CBOR length
			const metadataMarkers = ['a264', 'a265', 'a164', 'a165']
			for (const marker of metadataMarkers) {
				const lastIndex = code.lastIndexOf(marker)
				if (lastIndex > code.length - 200 && lastIndex > 0) {
					return code.slice(0, lastIndex)
				}
			}
			return code
		}

		const onchainStripped = stripMetadata(onchainBytecode)
		const compiledStripped = stripMetadata(compiledBytecode)

		const perfectMatch =
			onchainBytecode.toLowerCase() === compiledBytecode.toLowerCase()
		const partialMatch = onchainStripped === compiledStripped

		if (!partialMatch) {
			return context.json(
				{
					error: 'Bytecode mismatch',
					message: 'Compiled bytecode does not match on-chain bytecode',
					errorId: crypto.randomUUID(),
					debug: {
						onchainLength: onchainBytecode.length,
						compiledLength: compiledBytecode.length,
						onchainPrefix: onchainBytecode.slice(0, 100),
						compiledPrefix: compiledBytecode.slice(0, 100),
					},
				},
				400,
			)
		}

		const auditUser = 'verification-api'

		// Compute hashes for runtime bytecode
		const runtimeBytecodeBytes = Hex.toBytes(compiledBytecode as `0x${string}`)
		const runtimeCodeHashSha256 = new Uint8Array(
			await crypto.subtle.digest('SHA-256', runtimeBytecodeBytes),
		)
		const runtimeCodeHashKeccak = Hex.toBytes(
			keccak256(compiledBytecode as `0x${string}`),
		)

		// Compute hashes for creation bytecode
		const creationBytecode = `0x${compiledContract.evm.bytecode.object}`
		const creationBytecodeBytes = Hex.toBytes(creationBytecode as `0x${string}`)
		const creationCodeHashSha256 = new Uint8Array(
			await crypto.subtle.digest('SHA-256', creationBytecodeBytes),
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
			contractId = crypto.randomUUID()
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
			deploymentId = crypto.randomUUID()
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
					eq(compiledContractsTable.compiler, 'solc'),
					eq(compiledContractsTable.version, body.compilerVersion),
				),
			)
			.limit(1)

		let compilationId: string
		if (existingCompilation.length > 0 && existingCompilation[0]) {
			compilationId = existingCompilation[0].id
		} else {
			compilationId = crypto.randomUUID()
			await db.insert(compiledContractsTable).values({
				id: compilationId,
				compiler: 'solc',
				version: body.compilerVersion,
				language: stdJsonInput.language,
				name: contractName,
				fullyQualifiedName: contractIdentifier,
				compilerSettings: JSON.stringify(stdJsonInput.settings),
				compilationArtifacts: JSON.stringify({ abi: compiledContract.abi }),
				creationCodeHash: creationCodeHashSha256,
				creationCodeArtifacts: JSON.stringify({}),
				runtimeCodeHash: runtimeCodeHashSha256,
				runtimeCodeArtifacts: JSON.stringify({}),
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
				await crypto.subtle.digest('SHA-256', contentBytes),
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

			// Link source to compilation (ignore if already linked)
			await db
				.insert(compiledContractsSourcesTable)
				.values({
					id: crypto.randomUUID(),
					compilationId: compilationId,
					sourceHash: sourceHashSha256,
					path: sourcePath,
				})
				.onConflictDoNothing()
		}

		// Extract and insert signatures from ABI
		const abi = compiledContract.abi as Array<{
			type: string
			name?: string
			inputs?: Array<{ type: string }>
		}>
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
						id: crypto.randomUUID(),
						compilationId: compilationId,
						signatureHash32: signatureHash32,
						signatureType: signatureType,
					})
					.onConflictDoNothing()
			}
		}

		// Insert verified contract (or update if exists)
		await db
			.insert(verifiedContractsTable)
			.values({
				deploymentId,
				compilationId,
				creationMatch: false, // We only verified runtime bytecode
				runtimeMatch: true,
				runtimeMetadataMatch: perfectMatch,
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
			verificationResult.at(0)?.id?.toString() ?? crypto.randomUUID()

		return context.json(
			{
				verificationId,
				status: 'verified',
				match: perfectMatch ? 'perfect' : 'partial',
				chainId,
				address,
				contractName,
				contractPath,
				abi: compiledContract.abi,
			},
			202,
		)
	} catch (error) {
		console.error(error)
		return context.json(
			{
				error: 'Internal server error',
				message: 'An unexpected error occurred',
				errorId: crypto.randomUUID(),
			},
			500,
		)
	}
})

// POST /v2/verify/metadata/:chainId/:address - Verify Contract (using Solidity metadata.json)
verifyRoute.post('/metadata/:chainId/:address', (context) =>
	context.json({ error: 'Not implemented' }, 501),
)

// POST /v2/verify/similarity/:chainId/:address - Verify contract via similarity search
verifyRoute.post('/similarity/:chainId/:address', (context) =>
	context.json({ error: 'Not implemented' }, 501),
)

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
					errorId: crypto.randomUUID(),
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
				errorId: crypto.randomUUID(),
			},
			500,
		)
	}
})

export { verifyRoute }
