import { createServerFn } from '@tanstack/react-start'
import { type InferResponseType, parseResponse } from 'hono/client'
import type { Address } from 'ox'
import { VirtualAddress } from 'ox/tempo'
import { getCode } from 'viem/actions'
import { type AccountType, getAccountType } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import { api } from '#lib/server/tempo-api'
import {
	fetchTokenTransferBoundaries,
	fetchVirtualAddressTransferStats,
} from '#lib/server/tempo-queries'
import { parseTimestamp } from '#lib/timestamp'
import { zAddress } from '#lib/zod'
import { getBatchedClient, getTempoChain } from '#wagmi.config.ts'

/**
 * Token header stats: exact `holderCount` and the `TokenCreated` timestamp.
 * Transfer boundaries stay on the SQL lane (`fetchTokenTransferBoundaries`) —
 * the API's `include=transferStats` aggregates are silently omitted upstream
 * for the largest tokens.
 */
export async function fetchTokenHeaderStats(
	chainId: number,
	token: Address.Address,
): Promise<
	InferResponseType<(typeof api.v1.tokens)[':token']['$get'], 200> | undefined
> {
	return parseResponse(
		api.v1.tokens[':token'].$get({
			param: { token },
			query: {
				chainId: String(chainId),
				include: 'createdAt,holderCount',
			},
		}),
	).catch((error) => {
		console.error(`Failed to fetch token header stats for ${token}:`, error)
		return undefined
	})
}

type AddressTxAggregate = {
	count?: number
	latestTxsBlockTimestamp?: unknown
	oldestTxsBlockTimestamp?: unknown
	oldestTxHash?: string
	oldestTxFrom?: string
}

export function pickTip20CreatedTimestamp(params: {
	tokenCreatedTimestamp: unknown
	firstTransferTimestamp: unknown
}): number | undefined {
	const tokenCreatedTimestamp = parseTimestamp(params.tokenCreatedTimestamp)
	const firstTransferTimestamp = parseTimestamp(params.firstTransferTimestamp)

	if (tokenCreatedTimestamp != null) return tokenCreatedTimestamp
	return firstTransferTimestamp
}

export function buildAddressTxMetadata(aggregate: AddressTxAggregate): {
	txCount: number
	lastActivityTimestamp?: number
	createdTimestamp?: number
	createdTxHash?: string
	createdBy?: string
} {
	const oldestTimestamp = parseTimestamp(aggregate.oldestTxsBlockTimestamp)

	return {
		txCount: aggregate.count ?? 0,
		lastActivityTimestamp: parseTimestamp(aggregate.latestTxsBlockTimestamp),
		createdTimestamp: oldestTimestamp,
		createdTxHash: aggregate.oldestTxHash,
		createdBy: aggregate.oldestTxFrom,
	}
}

/** Address activity boundaries and count from structured Tempo API pages. */
export async function fetchAddressTxMetadata(
	chainId: number,
	address: Address.Address,
): Promise<AddressTxAggregate> {
	const [oldestPage, latestPage] = await Promise.all([
		parseResponse(
			api.v1.transactions.$get({
				query: {
					address,
					chainId: String(chainId),
					include: 'totalCount',
					limit: '5',
					order: 'asc',
				},
			}),
		),
		parseResponse(
			api.v1.transactions.$get({
				query: {
					address,
					chainId: String(chainId),
					limit: '5',
					order: 'desc',
				},
			}),
		),
	])
	const oldest = oldestPage.data[0]
	const latest = latestPage.data[0]

	return {
		count: oldestPage.meta?.totalCount,
		latestTxsBlockTimestamp: latest?.timestamp,
		oldestTxsBlockTimestamp: oldest?.timestamp,
		oldestTxHash: oldest?.hash,
		oldestTxFrom: oldest?.sender,
	}
}

export type AddressMetadata = {
	address: string
	chainId: number
	accountType: AccountType
	txCount?: number
	holdersCount?: number
	lastActivityTimestamp?: number
	createdTimestamp?: number
	createdTxHash?: string
	createdBy?: string
}

const METADATA_CACHE_TTL = 30_000
const METADATA_CACHE_MAX_ENTRIES = 50
const metadataCache = new Map<
	string,
	{ promise: Promise<AddressMetadata>; timestamp: number }
>()

/**
 * Address header/OG metadata (tx counts, holder counts, activity boundaries).
 * Shared by the `/api/address/metadata` route and the `fetchAddressMetadata`
 * server fn so SSR calls it in-process — the Worker cannot fetch its own
 * hostname. Cached briefly (as the in-flight promise, so the loader and
 * `head()` share one upstream round trip): the counts are slow (seconds)
 * upstream and every SSR of an address page needs them.
 */
export function getAddressMetadata(
	address: Address.Address,
): Promise<AddressMetadata> {
	const { id: chainId } = getTempoChain()
	const cacheKey = `${chainId}-${address}`
	const cached = metadataCache.get(cacheKey)
	if (cached && Date.now() - cached.timestamp < METADATA_CACHE_TTL)
		return cached.promise

	if (
		!metadataCache.has(cacheKey) &&
		metadataCache.size >= METADATA_CACHE_MAX_ENTRIES
	) {
		const oldestKey = metadataCache.keys().next().value
		if (oldestKey) metadataCache.delete(oldestKey)
	}
	const promise = loadAddressMetadata(address, chainId)
	metadataCache.set(cacheKey, { promise, timestamp: Date.now() })
	promise.catch(() => {
		if (metadataCache.get(cacheKey)?.promise === promise)
			metadataCache.delete(cacheKey)
	})
	return promise
}

async function loadAddressMetadata(
	address: Address.Address,
	chainId: number,
): Promise<AddressMetadata> {
	const client = getBatchedClient()
	const isTip20 = isTip20Address(address)
	const isVirtual = VirtualAddress.validate(address)

	const bytecodePromise = getCode(client, { address }).catch(() => undefined)

	let response: AddressMetadata

	if (isVirtual) {
		// One aggregate: exact distinct transfer-tx count + boundaries.
		const [bytecode, stats] = await Promise.all([
			bytecodePromise,
			fetchVirtualAddressTransferStats(address, chainId).catch(() => ({
				count: 0,
				oldestTimestamp: undefined,
				latestTimestamp: undefined,
			})),
		])
		response = {
			address,
			chainId,
			accountType: getAccountType(bytecode),
			txCount: stats.count,
			lastActivityTimestamp: parseTimestamp(stats.latestTimestamp),
			createdTimestamp: parseTimestamp(stats.oldestTimestamp),
		}
	} else if (isTip20) {
		// Exact holder count + TokenCreated timestamp from the API;
		// transfer boundaries in one raw-logs aggregate. The API omits
		// `holderCount` for tokens it has no holder index for — leave the
		// count unset there rather than reporting zero.
		const [bytecode, stats, boundaries] = await Promise.all([
			bytecodePromise,
			fetchTokenHeaderStats(chainId, address),
			fetchTokenTransferBoundaries(address, chainId).catch(() => ({
				oldestTimestamp: undefined,
				latestTimestamp: undefined,
			})),
		])
		response = {
			address,
			chainId,
			accountType: getAccountType(bytecode),
			holdersCount: stats?.holderCount,
			lastActivityTimestamp: parseTimestamp(boundaries.latestTimestamp),
			createdTimestamp: pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: stats?.createdAt,
				firstTransferTimestamp: boundaries.oldestTimestamp,
			}),
		}
	} else {
		// Structured Tempo API pages provide the first and latest indexed activity
		// without the historical RPC binary search previously used for contracts.
		const [bytecode, stats] = await Promise.all([
			bytecodePromise,
			fetchAddressTxMetadata(chainId, address),
		])
		const accountType = getAccountType(bytecode)
		const metadata = buildAddressTxMetadata(stats)

		response = {
			address,
			chainId,
			accountType,
			...metadata,
		}
	}

	return response
}

export const fetchAddressMetadata = createServerFn({ method: 'GET' })
	.inputValidator((input) => zAddress({ lowercase: true }).parse(input))
	.handler(({ data }) => getAddressMetadata(data))
