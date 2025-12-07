import { queryOptions } from '@tanstack/react-query'
import type { Hex } from 'ox'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import { parseKnownEvents } from '#lib/domain/known-events'
import { getFeeBreakdown } from '#lib/domain/receipt'
import * as Tip20 from '#lib/domain/tip20'
import { getConfig } from '#wagmi.config'

export function txQueryOptions(params: { hash: Hex.Hex }) {
	return queryOptions({
		queryKey: ['tx-detail', params.hash],
		queryFn: () => fetchTxData(params),
	})
}

async function fetchTxData(params: { hash: Hex.Hex }) {
	const config = getConfig()
	const receipt = await getTransactionReceipt(config, { hash: params.hash })

	const [block, transaction, getTokenMetadata] = await Promise.all([
		getBlock(config, { blockHash: receipt.blockHash }),
		getTransaction(config, { hash: receipt.transactionHash }),
		Tip20.metadataFromLogs(receipt.logs),
	])

	const knownEvents = parseKnownEvents(receipt, {
		transaction,
		getTokenMetadata,
	})

	const feeBreakdown = getFeeBreakdown(receipt, { getTokenMetadata })

	return {
		block,
		feeBreakdown,
		knownEvents,
		receipt,
		transaction,
	}
}

export type TxData = Awaited<ReturnType<typeof fetchTxData>>
