import { queryOptions } from '@tanstack/react-query'
import { all } from 'better-all'
import type { Hex } from 'ox'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import { parseKnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { getFeeBreakdown } from '#lib/domain/receipt'
import * as Tip20 from '#lib/domain/tip20'
import { getWagmiConfig } from '#wagmi.config.ts'

export function txQueryOptions(params: { hash: Hex.Hex }) {
	return queryOptions({
		queryKey: ['tx-detail', params.hash],
		queryFn: () => fetchTxData(params),
	})
}

async function fetchTxData(params: { hash: Hex.Hex }) {
	const config = getWagmiConfig()

	const { receipt, block, transaction, getTokenMetadata } = await all({
		async receipt() {
			return getTransactionReceipt(config, { hash: params.hash })
		},
		async block() {
			return getBlock(config, { blockHash: (await this.$.receipt).blockHash })
		},
		async transaction() {
			return getTransaction(config, {
				hash: (await this.$.receipt).transactionHash,
			})
		},
		async getTokenMetadata() {
			return Tip20.metadataFromLogs((await this.$.receipt).logs)
		},
	})

	const knownEvents = parseKnownEvents(receipt, {
		transaction,
		getTokenMetadata,
	})

	const feeBreakdown = getFeeBreakdown(receipt, { getTokenMetadata })

	const knownEventsByLog = receipt.logs.map((log) =>
		parseKnownEvent(log, { getTokenMetadata }),
	)

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
