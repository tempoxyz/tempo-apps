import { and, asc, desc, eq, gt, lt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hono } from 'hono'
import { Address, Hex } from 'ox'

import { DEVNET_CHAIN_ID, TESTNET_CHAIN_ID } from '#chains.ts'
import {
	compiledContractsTable,
	contractDeploymentsTable,
	verifiedContractsTable,
} from '#database/schema.ts'

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
			return context.json(
				{
					error: 'Invalid address',
					message: `Invalid address: ${address}`,
					errorId: crypto.randomUUID(),
				},
				400,
			)

		const db = drizzle(context.env.CONTRACTS_DB)
		const addressBytes = Hex.toBytes(address as `0x${string}`)

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

// GET /v2/contract/:chainId/:address - Get verified contract
lookupRoute.get('/:chainId/:address', async (context) => {
	try {
		const { chainId, address } = context.req.param()
		const { fields, omit } = context.req.query()

		if (![DEVNET_CHAIN_ID, TESTNET_CHAIN_ID].includes(Number(chainId)))
			return context.json(
				{
					error: 'Invalid chainId',
					message: `Invalid chainId: ${chainId}`,
					errorId: crypto.randomUUID(),
				},
				400,
			)

		if (!Address.validate(address, { strict: true }))
			return context.json(
				{
					error: 'Invalid address',
					message: `Invalid address: ${address}`,
					errorId: crypto.randomUUID(),
				},
				400,
			)

		if (fields && omit)
			return context.json(
				{
					error: 'Invalid query params',
					message:
						'Cannot use both fields and omit query parameters simultaneously',
					errorId: crypto.randomUUID(),
				},
				400,
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
				// For extended response
				chainId: contractDeploymentsTable.chainId,
				address: contractDeploymentsTable.address,
				transactionHash: contractDeploymentsTable.transactionHash,
				blockNumber: contractDeploymentsTable.blockNumber,
				contractName: compiledContractsTable.name,
				fullyQualifiedName: compiledContractsTable.fullyQualifiedName,
				compiler: compiledContractsTable.compiler,
				version: compiledContractsTable.version,
				language: compiledContractsTable.language,
				compilerSettings: compiledContractsTable.compilerSettings,
				compilationArtifacts: compiledContractsTable.compilationArtifacts,
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
			return context.json(
				{
					error: 'Contract not found',
					message: `Contract ${address} on chain ${chainId} not found or not verified`,
					errorId: crypto.randomUUID(),
				},
				404,
			)

		const [row] = results
		if (!row) {
			return context.json(
				{
					error: 'Contract not found',
					message: `Contract ${address} on chain ${chainId} not found or not verified`,
					errorId: crypto.randomUUID(),
				},
				404,
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

		// Minimal response (default)
		const minimalResponse = {
			matchId: row.matchId,
			match: matchStatus,
			creationMatch: creationMatchStatus,
			runtimeMatch: runtimeMatchStatus,
			chainId: row.chainId,
			address: Hex.fromBytes(new Uint8Array(row.address as ArrayBuffer)),
			verifiedAt: row.verifiedAt,
		}

		// If no fields requested, return minimal response
		if (!fields && !omit) return context.json(minimalResponse)

		// Build full response for field filtering
		const artifacts = JSON.parse(row.compilationArtifacts ?? '{}') as {
			abi?: unknown[]
			userdoc?: unknown
			devdoc?: unknown
			storageLayout?: unknown
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
			abi: artifacts.abi ?? null,
			userdoc: artifacts.userdoc ?? null,
			devdoc: artifacts.devdoc ?? null,
			storageLayout: artifacts.storageLayout ?? null,
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

// GET /v2/contracts/:chainId - List verified contracts on a specific chain
lookupAllChainContractsRoute.get('/:chainId', async (context) => {
	try {
		const { chainId } = context.req.param()
		const { sort, limit, afterMatchId } = context.req.query()

		if (![DEVNET_CHAIN_ID, TESTNET_CHAIN_ID].includes(Number(chainId)))
			return context.json(
				{
					customCode: 'unsupported_chain',
					message: `The chain with chainId ${chainId} is not supported`,
					errorId: crypto.randomUUID(),
				},
				400,
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

export { lookupRoute, lookupAllChainContractsRoute }
