import { createServerFn } from '@tanstack/react-start'
import { type InferResponseType, parseResponse } from 'hono/client'
import type { Address } from 'ox'
import { VirtualAddress } from 'ox/tempo'
import { getCode } from 'viem/actions'
import { type AccountType, getAccountType } from '#lib/account'
import { isTip20Address } from '#lib/domain/tip20'
import {
	type ContractCreationData,
	fetchContractCreationData,
} from '#lib/server/contract-creation'
import { api } from '#lib/server/tempo-api'
import {
	type ContractCreationReceiptRow,
	fetchAddressOldestTx,
	fetchAddressTxStats,
	fetchContractCreationReceipt,
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
	contractCreationTimestamp?: unknown
}): number | undefined {
	const tokenCreatedTimestamp = parseTimestamp(params.tokenCreatedTimestamp)
	const firstTransferTimestamp = parseTimestamp(params.firstTransferTimestamp)
	const contractCreationTimestamp = parseTimestamp(
		params.contractCreationTimestamp,
	)

	if (tokenCreatedTimestamp != null) return tokenCreatedTimestamp

	return contractCreationTimestamp != null &&
		(firstTransferTimestamp == null ||
			contractCreationTimestamp < firstTransferTimestamp)
		? contractCreationTimestamp
		: firstTransferTimestamp
}

export function buildAddressTxMetadata(
	aggregate: AddressTxAggregate,
	creation: ContractCreationReceiptRow | ContractCreationData | undefined,
): {
	txCount: number
	lastActivityTimestamp?: number
	createdTimestamp?: number
	createdTxHash?: string
	createdBy?: string
} {
	const oldestTimestamp = parseTimestamp(aggregate.oldestTxsBlockTimestamp)
	const creationTimestamp = parseTimestamp(
		creation && 'block_timestamp' in creation
			? creation.block_timestamp
			: creation?.timestamp,
	)
	const useCreation =
		creationTimestamp != null &&
		(oldestTimestamp == null || creationTimestamp <= oldestTimestamp)

	return {
		txCount: (aggregate.count ?? 0) + (creation ? 1 : 0),
		lastActivityTimestamp: parseTimestamp(aggregate.latestTxsBlockTimestamp),
		createdTimestamp:
			useCreation && creationTimestamp != null
				? creationTimestamp
				: oldestTimestamp,
		createdTxHash:
			useCreation && creation
				? 'tx_hash' in creation
					? creation.tx_hash
					: (creation.hash ?? undefined)
				: aggregate.oldestTxHash,
		createdBy:
			useCreation && creation
				? (creation.from ?? undefined)
				: aggregate.oldestTxFrom,
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
		const contractCreation =
			stats?.createdAt == null
				? await fetchContractCreationData(address).catch(() => null)
				: null

		response = {
			address,
			chainId,
			accountType: getAccountType(bytecode),
			holdersCount: stats?.holderCount,
			lastActivityTimestamp: parseTimestamp(boundaries.latestTimestamp),
			createdTimestamp: pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: stats?.createdAt,
				firstTransferTimestamp: boundaries.oldestTimestamp,
				contractCreationTimestamp: contractCreation?.timestamp,
			}),
		}
	} else {
		// One aggregate (exact distinct count + boundaries) + the oldest
		// tx row for the "created by" stat. Creation receipt stays on
		// the SQL lane (D4.1) with the existing RPC bisection fallback.
		const [bytecode, stats, oldestTx, indexedCreation] = await Promise.all([
			bytecodePromise,
			fetchAddressTxStats(address, chainId),
			fetchAddressOldestTx(address, chainId).catch(() => undefined),
			fetchContractCreationReceipt(address, chainId).catch(() => undefined),
		])
		const accountType = getAccountType(bytecode)
		const creation =
			indexedCreation ??
			(accountType === 'contract'
				? await fetchContractCreationData(address).catch(() => null)
				: undefined) ??
			undefined
		const metadata = buildAddressTxMetadata(
			{
				count: stats.count,
				latestTxsBlockTimestamp: stats.latestTimestamp,
				oldestTxsBlockTimestamp: stats.oldestTimestamp,
				oldestTxHash: oldestTx?.hash,
				oldestTxFrom: oldestTx?.from,
			},
			creation,
		)

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
