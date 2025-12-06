import { Link } from '@tanstack/react-router'
import { Address, Hex, Value } from 'ox'
import * as React from 'react'
import type { RpcTransaction as Transaction, TransactionReceipt } from 'viem'
import type { getBlock } from 'wagmi/actions'
import { FormattedTimestamp, type TimeFormat } from '#components/ui/TimeFormat'
import type { KnownEvent, KnownEventPart } from '#lib/domain/known-events.ts'
import { PriceFormatter } from '#lib/formatting'
import { EventDescription } from './EventDescription.tsx'

export type TransactionData = {
	receipt: TransactionReceipt
	block: Awaited<ReturnType<typeof getBlock>>
	knownEvents: KnownEvent[]
}

type BatchTransactionDataContextValue = {
	transactionDataMap: Map<Hex.Hex, TransactionData>
	isLoading: boolean
}

export const BatchTransactionDataContext =
	React.createContext<BatchTransactionDataContextValue>({
		transactionDataMap: new Map(),
		isLoading: true,
	})

export function useTransactionDataFromBatch(hash: Hex.Hex) {
	return React.useContext(BatchTransactionDataContext).transactionDataMap.get(
		hash,
	)
}

export function TransactionFee(props: { receipt?: TransactionReceipt }) {
	const { receipt } = props

	if (!receipt) return <span className="text-tertiary">…</span>

	const fee = Number(
		Value.format(receipt.effectiveGasPrice * receipt.gasUsed, 18),
	)

	return <span className="text-tertiary">{PriceFormatter.format(fee)}</span>
}

export function TransactionDescription(props: {
	transaction: Transaction
	knownEvents: Array<KnownEvent>
	transactionReceipt: TransactionReceipt | undefined
	accountAddress: Address.Address
}) {
	const { knownEvents, accountAddress } = props

	const transformEvent = React.useCallback(
		(event: KnownEvent) => getPerspectiveEvent(event, accountAddress),
		[accountAddress],
	)

	return (
		<EventDescription.ExpandGroup
			events={knownEvents}
			seenAs={accountAddress}
			transformEvent={transformEvent}
		/>
	)
}

export function getPerspectiveEvent(
	event: KnownEvent,
	accountAddress?: Address.Address,
) {
	if (!accountAddress) return event
	if (event.type !== 'send') return event
	const toMatches =
		event.meta?.to && Address.isEqual(event.meta.to, accountAddress)
	const fromMatches =
		event.meta?.from && Address.isEqual(event.meta.from, accountAddress)
	if (!toMatches || fromMatches) return event

	const sender = event.meta?.from
	const updatedParts = event.parts.map((part) => {
		if (part.type === 'action') return { ...part, value: 'Received' }
		if (part.type === 'text' && part.value.toLowerCase() === 'to')
			return { ...part, value: 'from' }
		if (part.type === 'account' && sender) return { ...part, value: sender }
		return part
	})
	return { ...event, parts: updatedParts }
}

export function TransactionTimestamp(props: {
	timestamp: bigint
	link?: string
	format?: TimeFormat
}) {
	const { timestamp, link, format = 'relative' } = props

	return (
		<div className="text-nowrap">
			{link ? (
				<Link to={link} className="text-tertiary">
					<FormattedTimestamp timestamp={timestamp} format={format} />
				</Link>
			) : (
				<FormattedTimestamp
					timestamp={timestamp}
					format={format}
					className="text-tertiary"
				/>
			)}
		</div>
	)
}

export function TransactionTotal(props: { transaction: Transaction }) {
	const { transaction } = props
	const batchData = useTransactionDataFromBatch(transaction.hash)

	const amountParts = React.useMemo(() => {
		if (!batchData) return

		return batchData.knownEvents.flatMap((event) =>
			event.parts.filter(
				(part): part is Extract<KnownEventPart, { type: 'amount' }> =>
					part.type === 'amount',
			),
		)
	}, [batchData])
	if (!amountParts?.length) return <>$0.00</>

	const totalValue = amountParts.reduce((sum, part) => {
		const decimals = part.value.decimals ?? 6
		return sum + Number(Value.format(part.value.value, decimals))
	}, 0)

	if (totalValue === 0) {
		const value = transaction.value ? Hex.toBigInt(transaction.value) : 0n
		if (value === 0n) return <span className="text-tertiary">—</span>
		return (
			<span className="text-primary">
				{PriceFormatter.format(value, { decimals: 18, format: 'short' })}
			</span>
		)
	}

	return (
		<span className="text-primary">{PriceFormatter.format(totalValue)}</span>
	)
}
