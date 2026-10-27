import { queryOptions } from '@tanstack/react-query'
import type { Hex } from 'ox'
import { toEventSelector } from 'viem'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import {
	type Authorization,
	decodeKnownTransactionCalls,
	parseAuthorizationEvents,
	parseKnownEvent,
	isStreamChannelAddress,
	parseKnownEvents,
	STREAM_CHANNELS,
} from '#lib/domain/known-events'
import { exactNonce } from '#lib/domain/nonce'
import { getFeeBreakdown } from '#lib/domain/receipt'
import * as Tip20 from '#lib/domain/tip20'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { getTempoChain, getWagmiConfig } from '#wagmi.config.ts'
import type { KeyAuthorization } from '#lib/domain/access-key'

const transferTopic = toEventSelector(
	'event Transfer(address indexed, address indexed, uint256)',
)
const transferWithMemoTopic = toEventSelector(
	'event TransferWithMemo(address indexed, address indexed, uint256, bytes32 indexed)',
)

export function txQueryOptions(params: { hash: Hex.Hex }) {
	return queryOptions({
		queryKey: ['tx-detail', params.hash],
		queryFn: () => fetchTxData(params),
	})
}

async function fetchTxDataUncached(params: { hash: Hex.Hex }) {
	const config = getWagmiConfig()

	const receipt = await getTransactionReceipt(config, { hash: params.hash })

	// TODO: investigate & consider batch/multicall
	const [block, transaction, getTokenMetadata] = await Promise.all([
		getBlock(config, { blockHash: receipt.blockHash }),
		getTransaction(config, { hash: receipt.transactionHash }),
		Tip20.metadataFromLogs(receipt.logs),
	])
	// Only set when the formatted nonce lost precision.
	const nonce =
		typeof transaction.nonce === 'number' &&
		!Number.isSafeInteger(transaction.nonce)
			? await fetchExactNonce(receipt.transactionHash)
			: undefined

	const parsedEvents = parseKnownEvents(receipt, {
		transaction,
		getTokenMetadata,
	})
	// Wagmi's mixed-chain return type omits Tempo's formatted extension fields.
	const keyAuthorization =
		'keyAuthorization' in transaction
			? (transaction.keyAuthorization as KeyAuthorization | null)
			: undefined
	const keyTokenMetadata: Record<
		string,
		Pick<Tip20.Metadata, 'decimals' | 'symbol'>
	> = {}
	await Promise.all(
		(keyAuthorization?.limits ?? []).map(async ({ token }) => {
			const metadata =
				getTokenMetadata(token) ??
				(await Tip20.metadataForTokens([token])
					.then((getMetadata) => getMetadata(token))
					.catch(() => undefined))
			if (metadata)
				keyTokenMetadata[token.toLowerCase()] = {
					decimals: metadata.decimals,
					symbol: metadata.symbol,
				}
		}),
	)

	const knownCalls = decodeKnownTransactionCalls(transaction, receipt.status)

	// Parse EIP-7702 authorization list for delegate account events
	const authorizationList =
		'authorizationList' in transaction
			? (transaction.authorizationList as readonly Authorization[] | undefined)
			: undefined
	const authEvents = parseAuthorizationEvents(authorizationList)

	// Keep evidence separate until the shared description composer selects actions.
	const knownEvents = [...authEvents, ...parsedEvents]

	const feeBreakdown = getFeeBreakdown(receipt, { getTokenMetadata })

	const streamChannelIndices = new Set<number>()
	let streamChannelToken: `0x${string}` | undefined

	const hasStreamChannelEvents = receipt.logs.some((log) =>
		isStreamChannelAddress(log.address),
	)

	if (hasStreamChannelEvents) {
		for (const [index, log] of receipt.logs.entries()) {
			const topic0 = log.topics[0]?.toLowerCase()
			if (
				topic0 !== transferTopic.toLowerCase() &&
				topic0 !== transferWithMemoTopic.toLowerCase()
			)
				continue

			const [, fromTopic, toTopic] = log.topics
			if (!fromTopic || !toTopic) continue

			const from = `0x${fromTopic.slice(-40)}`.toLowerCase()
			const to = `0x${toTopic.slice(-40)}`.toLowerCase()
			const streamChannel = STREAM_CHANNELS.find((streamChannel) => {
				const lower = streamChannel.toLowerCase()
				return from === lower || to === lower
			})

			if (!streamChannel) continue

			streamChannelIndices.add(index)
			if (!streamChannelToken) streamChannelToken = log.address
		}
	}

	const knownEventsByLog = receipt.logs.map((log, index) => {
		if (streamChannelIndices.has(index)) {
			return { type: 'hidden', parts: [] }
		}

		return parseKnownEvent(log, {
			getTokenMetadata,
			streamChannelToken,
		})
	})

	return {
		block,
		keyAuthorization,
		keyTokenMetadata,
		feeBreakdown,
		knownCalls,
		knownEvents,
		knownEventsByLog,
		nonce,
		receipt,
		transaction,
	}
}

/**
 * Viem rounds nonces above 2^53, such as TIP-1106 expiring nonce
 * discriminators, so read the RPC's hex value for those.
 */
async function fetchExactNonce(hash: Hex.Hex) {
	const client = getWagmiConfig().getClient()
	const rpcTransaction = (await client
		.request({
			method: 'eth_getTransactionByHash',
			params: [hash],
		} as Parameters<typeof client.request>[0])
		.catch(() => null)) as { nonce?: string } | null
	return exactNonce(rpcTransaction?.nonce)
}

async function fetchTxData(params: { hash: Hex.Hex }) {
	return withImmutableDataCache({
		key: `tx-detail:v3:${getTempoChain().id}:${params.hash.toLowerCase()}`,
		load: () => fetchTxDataUncached(params),
		// Retry a failed exact-nonce lookup instead of caching a rounded nonce.
		shouldCache: (data) =>
			data.nonce !== undefined || Number.isSafeInteger(data.transaction.nonce),
	})
}

export type TxData = Awaited<ReturnType<typeof fetchTxData>>
