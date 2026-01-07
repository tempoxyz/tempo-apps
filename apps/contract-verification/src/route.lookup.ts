import { and, asc, desc, eq, gt, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { Address, Hex } from 'ox'

import { DEVNET_CHAIN_ID, TESTNET_CHAIN_ID } from '#chains.ts'

import {
	codeTable,
	compiledContractsSignaturesTable,
	compiledContractsSourcesTable,
	compiledContractsTable,
	contractDeploymentsTable,
	signaturesTable,
	sourcesTable,
	verifiedContractsTable,
} from '#database/schema.ts'
import { sourcifyError } from '#utilities.ts'

/**
 * GET /v2/contract/{chainId}/{address}
 * GET /v2/contract/all-chains/{address}
 * GET /v2/contracts/{chainId}
 */

const lookupRoute = new Hono<{ Bindings: Cloudflare.Env }>()
const lookupAllChainContractsRoute = new Hono<{ Bindings: Cloudflare.Env }>()

// GET /v2/contract/all-chains/:address - Get verified contract at an address on all chains
// Note: This route must be defined before /:chainId/:address to avoid matching conflicts
lookupRoute.get('/all-chains/:address', async (context) => {
	try {
		const { address } = context.req.param()

		if (!Address.validate(address, { strict: true }))
			return sourcifyError(
				context,
				400,
				'invalid_address',
				`Invalid address: ${address}`,
			)

		const db = drizzle(context.env.CONTRACTS_DB)
		const addressBytes = Hex.toBytes(address)

		// Query all verified contracts at this address across all chains
		const results = await db
			.select({
				matchId: verifiedContractsTable.id,
				verifiedAt: verifiedContractsTable.createdAt,
				runtimeMatch: verifiedContractsTable.runtimeMatch,
				creationMatch: verifiedContractsTable.creationMatch,
				runtimeMetadataMatch: verifiedContractsTable.runtimeMetadataMatch,
				creationMetadataMatch: verifiedContractsTable.creationMetadataMatch,
				chainId: contractDeploymentsTable.chainId,
				address: contractDeploymentsTable.address,
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
			.where(eq(contractDeploymentsTable.address, addressBytes))

		// Transform results to minimal format per OpenAPI spec
		const contracts = results.map((row) => {
			const runtimeMatchStatus = row.runtimeMatch ? 'exact_match' : 'match'
			const creationMatchStatus = row.creationMatch ? 'exact_match' : 'match'
			const matchStatus =
				runtimeMatchStatus === 'exact_match' ||
				creationMatchStatus === 'exact_match'
					? 'exact_match'
					: runtimeMatchStatus || creationMatchStatus

			return {
				matchId: row.matchId,
				match: matchStatus,
				creationMatch: creationMatchStatus,
				runtimeMatch: runtimeMatchStatus,
				chainId: row.chainId,
				address: Hex.fromBytes(new Uint8Array(row.address as ArrayBuffer)),
				verifiedAt: row.verifiedAt,
			}
		})

		return context.json({ results: contracts })
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

// GET /v2/contract/:chainId/:address - Get verified contract
lookupRoute.get('/:chainId/:address', async (context) => {
	try {
		const { chainId, address } = context.req.param()
		const { fields, omit } = context.req.query()

		if (![DEVNET_CHAIN_ID, TESTNET_CHAIN_ID].includes(Number(chainId)))
			return sourcifyError(
				context,
				400,
				'unsupported_chain',
				`The chain with chainId ${chainId} is not supported`,
			)

		if (!Address.validate(address, { strict: true }))
			return sourcifyError(
				context,
				400,
				'invalid_address',
				`Invalid address: ${address}`,
			)

		if (fields && omit)
			return sourcifyError(
				context,
				400,
				'invalid_params',
				'Cannot use both fields and omit query parameters simultaneously',
			)

		const db = drizzle(context.env.CONTRACTS_DB)
		const addressBytes = Hex.toBytes(address)

		// Query verified contract at this address on the specified chain
		const results = await db
			.select({
				// For minimal response
				matchId: verifiedContractsTable.id,
				verifiedAt: verifiedContractsTable.createdAt,
				runtimeMatch: verifiedContractsTable.runtimeMatch,
				creationMatch: verifiedContractsTable.creationMatch,
				runtimeMetadataMatch: verifiedContractsTable.runtimeMetadataMatch,
				creationMetadataMatch: verifiedContractsTable.creationMetadataMatch,
				runtimeValues: verifiedContractsTable.runtimeValues,
				creationValues: verifiedContractsTable.creationValues,
				runtimeTransformations: verifiedContractsTable.runtimeTransformations,
				creationTransformations: verifiedContractsTable.creationTransformations,
				// For extended response
				chainId: contractDeploymentsTable.chainId,
				address: contractDeploymentsTable.address,
				transactionHash: contractDeploymentsTable.transactionHash,
				blockNumber: contractDeploymentsTable.blockNumber,
				transactionIndex: contractDeploymentsTable.transactionIndex,
				deployer: contractDeploymentsTable.deployer,
				// Compilation info
				compilationId: compiledContractsTable.id,
				contractName: compiledContractsTable.name,
				fullyQualifiedName: compiledContractsTable.fullyQualifiedName,
				compiler: compiledContractsTable.compiler,
				version: compiledContractsTable.version,
				language: compiledContractsTable.language,
				compilerSettings: compiledContractsTable.compilerSettings,
				compilationArtifacts: compiledContractsTable.compilationArtifacts,
				creationCodeArtifacts: compiledContractsTable.creationCodeArtifacts,
				runtimeCodeArtifacts: compiledContractsTable.runtimeCodeArtifacts,
				creationCodeHash: compiledContractsTable.creationCodeHash,
				runtimeCodeHash: compiledContractsTable.runtimeCodeHash,
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
			.where(
				and(
					eq(contractDeploymentsTable.chainId, Number(chainId)),
					eq(contractDeploymentsTable.address, addressBytes),
				),
			)
			.limit(1)

		if (results.length === 0)
			return sourcifyError(
				context,
				404,
				'contract_not_found',
				`Contract ${address} on chain ${chainId} not found or not verified`,
			)

		const [row] = results
		if (!row) {
			return sourcifyError(
				context,
				404,
				'contract_not_found',
				`Contract ${address} on chain ${chainId} not found or not verified`,
			)
		}

		// Compute match statuses per OpenAPI spec
		const runtimeMatchStatus = row.runtimeMatch ? 'exact_match' : 'match'
		const creationMatchStatus = row.creationMatch ? 'exact_match' : 'match'
		// Overall match: best of runtime or creation
		const matchStatus =
			runtimeMatchStatus === 'exact_match' ||
			creationMatchStatus === 'exact_match'
				? 'exact_match'
				: runtimeMatchStatus || creationMatchStatus

		const formattedAddress = Hex.fromBytes(
			new Uint8Array(row.address as ArrayBuffer),
		)

		// Minimal response (default)
		const minimalResponse = {
			matchId: row.matchId,
			match: matchStatus,
			creationMatch: creationMatchStatus,
			runtimeMatch: runtimeMatchStatus,
			chainId: row.chainId,
			address: formattedAddress,
			verifiedAt: row.verifiedAt,
		}

		// If no fields requested, return minimal response
		if (!fields && !omit) return context.json(minimalResponse)

		// Fetch bytecode from code table
		const [creationCode, runtimeCode] = await Promise.all([
			row.creationCodeHash
				? db
						.select({ code: codeTable.code })
						.from(codeTable)
						.where(eq(codeTable.codeHash, row.creationCodeHash))
						.limit(1)
				: Promise.resolve([]),
			row.runtimeCodeHash
				? db
						.select({ code: codeTable.code })
						.from(codeTable)
						.where(eq(codeTable.codeHash, row.runtimeCodeHash))
						.limit(1)
				: Promise.resolve([]),
		])

		// Fetch sources
		const sourcesResult = await db
			.select({
				path: compiledContractsSourcesTable.path,
				content: sourcesTable.content,
				sourceHash: sourcesTable.sourceHash,
			})
			.from(compiledContractsSourcesTable)
			.innerJoin(
				sourcesTable,
				eq(compiledContractsSourcesTable.sourceHash, sourcesTable.sourceHash),
			)
			.where(eq(compiledContractsSourcesTable.compilationId, row.compilationId))

		// Fetch signatures
		const signaturesResult = await db
			.select({
				signature: signaturesTable.signature,
				signatureType: compiledContractsSignaturesTable.signatureType,
				signatureHash32: signaturesTable.signatureHash32,
			})
			.from(compiledContractsSignaturesTable)
			.innerJoin(
				signaturesTable,
				eq(
					compiledContractsSignaturesTable.signatureHash32,
					signaturesTable.signatureHash32,
				),
			)
			.where(
				eq(compiledContractsSignaturesTable.compilationId, row.compilationId),
			)

		// Build sources object, preferring normalized (relative) paths over absolute paths
		const sources: Record<string, { content: string }> = {}
		const sourceIds: Record<string, string> = {}
		const seenContentHashes = new Set<string>()

		// Sort to process relative paths first, then absolute paths
		const sortedSources = [...sourcesResult].sort((a, b) => {
			const aIsAbsolute = a.path.startsWith('/')
			const bIsAbsolute = b.path.startsWith('/')
			if (aIsAbsolute === bIsAbsolute) return 0
			return aIsAbsolute ? 1 : -1 // Relative paths first
		})

		for (const source of sortedSources) {
			const hashHex = Hex.fromBytes(
				new Uint8Array(source.sourceHash as ArrayBuffer),
			)
			// Skip if we already have this source content (prefer relative path)
			if (seenContentHashes.has(hashHex)) continue
			seenContentHashes.add(hashHex)

			sources[source.path] = { content: source.content }
			sourceIds[source.path] = hashHex
		}

		// Build signatures object (Sourcify format: grouped by type)
		const signatures: {
			function: Array<{
				signature: string
				signatureHash32: string
				signatureHash4: string
			}>
			event: Array<{
				signature: string
				signatureHash32: string
				signatureHash4: string
			}>
			error: Array<{
				signature: string
				signatureHash32: string
				signatureHash4: string
			}>
		} = { function: [], event: [], error: [] }

		for (const sig of signaturesResult) {
			const hash32Bytes = new Uint8Array(sig.signatureHash32 as ArrayBuffer)
			const signatureHash32 = Hex.fromBytes(hash32Bytes)
			const signatureHash4 = Hex.fromBytes(hash32Bytes.slice(0, 4))
			const type = sig.signatureType

			signatures[type].push({
				signature: sig.signature,
				signatureHash32,
				signatureHash4,
			})
		}

		// Build full response for field filtering
		const artifacts = JSON.parse(row.compilationArtifacts ?? '{}') as {
			abi?: unknown[]
			userdoc?: unknown
			devdoc?: unknown
			storageLayout?: unknown
			metadata?: unknown
		}

		const creationCodeArtifacts = JSON.parse(
			row.creationCodeArtifacts ?? '{}',
		) as {
			sourceMap?: string
			linkReferences?: unknown
			cborAuxdata?: unknown
		}

		const runtimeCodeArtifacts = JSON.parse(
			row.runtimeCodeArtifacts ?? '{}',
		) as {
			sourceMap?: string
			linkReferences?: unknown
			immutableReferences?: unknown
			cborAuxdata?: unknown
		}

		const creationBytecodeData = creationCode[0]?.code
			? Hex.fromBytes(new Uint8Array(creationCode[0].code as ArrayBuffer))
			: null
		const runtimeBytecodeData = runtimeCode[0]?.code
			? Hex.fromBytes(new Uint8Array(runtimeCode[0].code as ArrayBuffer))
			: null

		// Build stdJsonInput
		const stdJsonInput = {
			language: row.language,
			sources: Object.fromEntries(
				Object.entries(sources).map(([path, { content }]) => [
					path,
					{ content },
				]),
			),
			settings: JSON.parse(row.compilerSettings),
		}

		// Build stdJsonOutput (partial - what we have stored)
		const stdJsonOutput = {
			contracts: {
				[row.fullyQualifiedName.split(':')[0] ?? '']: {
					[row.contractName]: {
						abi: artifacts.abi,
						metadata:
							typeof artifacts.metadata === 'string'
								? artifacts.metadata
								: JSON.stringify(artifacts.metadata ?? {}),
						userdoc: artifacts.userdoc,
						devdoc: artifacts.devdoc,
						storageLayout: artifacts.storageLayout,
						evm: {
							bytecode: {
								object: creationBytecodeData,
								sourceMap: creationCodeArtifacts.sourceMap,
								linkReferences: creationCodeArtifacts.linkReferences,
							},
							deployedBytecode: {
								object: runtimeBytecodeData,
								sourceMap: runtimeCodeArtifacts.sourceMap,
								linkReferences: runtimeCodeArtifacts.linkReferences,
								immutableReferences: runtimeCodeArtifacts.immutableReferences,
							},
						},
					},
				},
			},
		}

		const fullResponse: Record<string, unknown> = {
			...minimalResponse,
			transactionHash: row.transactionHash
				? Hex.fromBytes(new Uint8Array(row.transactionHash as ArrayBuffer))
				: null,
			blockNumber: row.blockNumber,
			name: row.contractName,
			fullyQualifiedName: row.fullyQualifiedName,
			compiler: row.compiler,
			version: row.version,
			language: row.language,
			compilerSettings: JSON.parse(row.compilerSettings),
			runtimeMetadataMatch: row.runtimeMetadataMatch ? 'exact_match' : 'match',
			creationMetadataMatch: row.creationMetadataMatch
				? 'exact_match'
				: 'match',
			abi: artifacts.abi ?? null,
			userdoc: artifacts.userdoc ?? null,
			devdoc: artifacts.devdoc ?? null,
			storageLayout: artifacts.storageLayout ?? null,
			metadata: artifacts.metadata ?? null,
			sources,
			sourceIds,
			signatures,
			creationBytecode: creationBytecodeData
				? {
						bytecode: creationBytecodeData,
						sourceMap: creationCodeArtifacts.sourceMap ?? null,
						linkReferences: creationCodeArtifacts.linkReferences ?? null,
						cborAuxdata: creationCodeArtifacts.cborAuxdata ?? null,
					}
				: null,
			runtimeBytecode: runtimeBytecodeData
				? {
						bytecode: runtimeBytecodeData,
						sourceMap: runtimeCodeArtifacts.sourceMap ?? null,
						linkReferences: runtimeCodeArtifacts.linkReferences ?? null,
						immutableReferences:
							runtimeCodeArtifacts.immutableReferences ?? null,
						cborAuxdata: runtimeCodeArtifacts.cborAuxdata ?? null,
					}
				: null,
			compilation: {
				compiler: row.compiler,
				version: row.version,
				language: row.language,
				name: row.contractName,
				fullyQualifiedName: row.fullyQualifiedName,
				compilerSettings: JSON.parse(row.compilerSettings),
			},
			deployment: {
				chainId: row.chainId,
				address: formattedAddress,
				transactionHash: row.transactionHash
					? Hex.fromBytes(new Uint8Array(row.transactionHash as ArrayBuffer))
					: null,
				blockNumber: row.blockNumber,
				transactionIndex: row.transactionIndex,
				deployer: row.deployer
					? Hex.fromBytes(new Uint8Array(row.deployer as ArrayBuffer))
					: null,
			},
			stdJsonInput,
			stdJsonOutput,
			proxyResolution: null, // Not implemented yet
		}

		// Apply field filtering
		if (fields) {
			if (fields === 'all') return context.json(fullResponse)
			const fieldList = fields.split(',').map((f) => f.trim())
			const filtered: Record<string, unknown> = {
				// Always include minimal fields
				...minimalResponse,
			}
			for (const field of fieldList)
				if (field in fullResponse) filtered[field] = fullResponse[field]

			return context.json(filtered)
		}

		if (omit) {
			const omitList = omit.split(',').map((f) => f.trim())
			for (const field of omitList) delete fullResponse[field]

			return context.json(fullResponse)
		}

		return context.json(minimalResponse)
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

// GET /v2/contracts/:chainId - List verified contracts on a specific chain
lookupAllChainContractsRoute.get('/:chainId', async (context) => {
	try {
		const { chainId } = context.req.param()
		const { sort, limit, afterMatchId } = context.req.query()

		if (![DEVNET_CHAIN_ID, TESTNET_CHAIN_ID].includes(Number(chainId)))
			return sourcifyError(
				context,
				400,
				'unsupported_chain',
				`The chain with chainId ${chainId} is not supported`,
			)

		// Validate and parse query params
		const sortOrder = sort === 'asc' ? 'asc' : 'desc'
		const limitNum = Math.min(Math.max(Number(limit) || 200, 1), 200)

		const db = drizzle(context.env.CONTRACTS_DB)

		// Build query
		const query = db
			.select({
				matchId: verifiedContractsTable.id,
				verifiedAt: verifiedContractsTable.createdAt,
				runtimeMatch: verifiedContractsTable.runtimeMatch,
				creationMatch: verifiedContractsTable.creationMatch,
				chainId: contractDeploymentsTable.chainId,
				address: contractDeploymentsTable.address,
			})
			.from(verifiedContractsTable)
			.innerJoin(
				contractDeploymentsTable,
				eq(verifiedContractsTable.deploymentId, contractDeploymentsTable.id),
			)
			.where(
				afterMatchId
					? and(
							eq(contractDeploymentsTable.chainId, Number(chainId)),
							sortOrder === 'desc'
								? lt(verifiedContractsTable.id, Number(afterMatchId))
								: gt(verifiedContractsTable.id, Number(afterMatchId)),
						)
					: eq(contractDeploymentsTable.chainId, Number(chainId)),
			)
			.orderBy(
				sortOrder === 'desc'
					? desc(verifiedContractsTable.id)
					: asc(verifiedContractsTable.id),
			)
			.limit(limitNum)

		const results = await query

		// Transform results to match OpenAPI spec
		const contracts = results.map((row) => {
			const runtimeMatchStatus = row.runtimeMatch ? 'exact_match' : 'match'
			const creationMatchStatus = row.creationMatch ? 'exact_match' : 'match'
			const matchStatus =
				runtimeMatchStatus === 'exact_match' ||
				creationMatchStatus === 'exact_match'
					? 'exact_match'
					: 'match'

			return {
				matchId: row.matchId,
				match: matchStatus,
				creationMatch: creationMatchStatus,
				runtimeMatch: runtimeMatchStatus,
				chainId: row.chainId,
				address: Hex.fromBytes(new Uint8Array(row.address as ArrayBuffer)),
				verifiedAt: row.verifiedAt,
			}
		})

		return context.json({ results: contracts })
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

export { lookupRoute, lookupAllChainContractsRoute }
