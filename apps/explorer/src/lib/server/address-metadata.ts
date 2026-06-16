import { createServerFn } from '@tanstack/react-start'
import { type InferResponseType, parseResponse } from 'hono/client'
import * as Address from 'ox/Address'
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
import { getBatchedClient, getTempoChain } from '#wagmi.config'

/**
 * Token header stats: exact `holderCount` and the `TokenCreated` timestamp.
 * Transfer boundaries stay on the SQL lane (`fetchTokenTransferBoundaries`) —
 * Cadent's `include=transferStats` aggregates are silently omitted upstream
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

export type AddressMetadataResponse = {
	address: string
	chainId: number
	accountType: AccountType
	txCount?: number
	holdersCount?: number
	lastActivityTimestamp?: number
	createdTimestamp?: number
	createdTxHash?: string
	createdBy?: string
	error?: string
}

/**
 * Computes address header metadata (tx/holder counts, created/last-activity
 * timestamps, account type) directly from cadent + the chain. Shared by the
 * `/api/address/metadata` route and the `fetchAddressMetadata` server function.
 */
export async function fetchAddressMetadataData(
	address: Address.Address,
): Promise<AddressMetadataResponse> {
	Address.assert(address)

	const client = getBatchedClient()
	const { id: chainId } = getTempoChain()
	const isTip20 = isTip20Address(address)
	const isVirtual = VirtualAddress.validate(address)

	const bytecodePromise = getCode(client, { address }).catch(() => undefined)

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
		return {
			address,
			chainId,
			accountType: getAccountType(bytecode),
			txCount: stats.count,
			lastActivityTimestamp: parseTimestamp(stats.latestTimestamp),
			createdTimestamp: parseTimestamp(stats.oldestTimestamp),
		}
	}

	if (isTip20) {
		// Exact holder count + TokenCreated timestamp from Cadent;
		// transfer boundaries in one raw-logs aggregate.
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

		return {
			address,
			chainId,
			accountType: getAccountType(bytecode),
			holdersCount: stats?.holderCount ?? 0,
			lastActivityTimestamp: parseTimestamp(boundaries.latestTimestamp),
			createdTimestamp: pickTip20CreatedTimestamp({
				tokenCreatedTimestamp: stats?.createdAt,
				firstTransferTimestamp: boundaries.oldestTimestamp,
				contractCreationTimestamp: contractCreation?.timestamp,
			}),
		}
	}

	// One aggregate (exact distinct count + boundaries) + the oldest tx row for
	// the "created by" stat. Creation receipt stays on the SQL lane with the
	// existing RPC bisection fallback.
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

	return {
		address,
		chainId,
		accountType,
		...buildAddressTxMetadata(
			{
				count: stats.count,
				latestTxsBlockTimestamp: stats.latestTimestamp,
				oldestTxsBlockTimestamp: stats.oldestTimestamp,
				oldestTxHash: oldestTx?.hash,
				oldestTxFrom: oldestTx?.from,
			},
			creation,
		),
	}
}

/**
 * Server function for the address metadata query. Runs the logic directly
 * during SSR (no worker self-subrequest, which Cloudflare rejects with error
 * 1042 on workers.dev) and via Start RPC from the browser.
 */
export const fetchAddressMetadata = createServerFn({ method: 'POST' })
	.inputValidator((input: { address: string }) => ({
		address: zAddress({ lowercase: true }).parse(input.address),
	}))
	.handler(
		async ({ data }): Promise<AddressMetadataResponse> =>
			fetchAddressMetadataData(data.address),
	)
