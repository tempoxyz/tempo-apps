import { queryOptions } from '@tanstack/react-query'
import type { Hex } from 'ox'
import { toEventSelector } from 'viem'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import {
	type Authorization,
	decodeKnownCall,
	parseAuthorizationEvents,
	parseKnownEvent,
	parseKnownEvents,
	STREAM_CHANNEL,
} from '#lib/domain/known-events'
import { getFeeBreakdown } from '#lib/domain/receipt'
import * as Tip20 from '#lib/domain/tip20'
import { getWagmiConfig } from '#wagmi.config.ts'

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

async function fetchTxData(params: { hash: Hex.Hex }) {
	const config = getWagmiConfig()

	const receipt = await getTransactionReceipt(config, { hash: params.hash })

	// TODO: investigate & consider batch/multicall
	const [block, transaction, getTokenMetadata] = await Promise.all([
		getBlock(config, { blockHash: receipt.blockHash }),
		getTransaction(config, { hash: receipt.transactionHash }),
		Tip20.metadataFromLogs(receipt.logs),
	])

	const parsedEvents = parseKnownEvents(receipt, {
		transaction,
		getTokenMetadata,
	})

	// Try to decode known contract calls (e.g., validator precompile)
	// Prioritize decoded calls over fee-only events since they're more descriptive
	const knownCall =
		transaction.to && transaction.input && transaction.input !== '0x'
			? decodeKnownCall(transaction.to, transaction.input)
			: null

	// Parse EIP-7702 authorization list for delegate account events
	const authorizationList =
		'authorizationList' in transaction
			? (transaction.authorizationList as readonly Authorization[] | undefined)
			: undefined
	const authEvents = parseAuthorizationEvents(authorizationList)

	// Build knownEvents: authorization events first, then decoded call, then parsed events
	const knownEvents = [
		...authEvents,
		...(knownCall ? [knownCall] : []),
		...parsedEvents.filter((e) => (knownCall ? e.type !== 'fee' : true)),
	]

	const feeBreakdown = getFeeBreakdown(receipt, { getTokenMetadata })

	const streamChannelIndices = new Set<number>()
	let streamChannelToken: `0x${string}` | undefined

	const hasStreamChannelEvents = receipt.logs.some(
		(log) => log.address.toLowerCase() === STREAM_CHANNEL.toLowerCase(),
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
			const streamChannel = STREAM_CHANNEL.toLowerCase()

			if (from !== streamChannel && to !== streamChannel) continue

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
		feeBreakdown,
		knownEvents,
		knownEventsByLog,
		receipt,
		transaction,
	}
}

export type TxData = Awaited<ReturnType<typeof fetchTxData>>
