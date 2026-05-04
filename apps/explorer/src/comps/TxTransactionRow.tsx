import { Link } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import * as Value from 'ox/Value'
import * as React from 'react'
import type { RpcTransaction as Transaction, TransactionReceipt } from 'viem'
import type { GetBlockReturnType } from 'wagmi/actions'
import { Amount } from '#comps/Amount'
import { useTokenListMembership } from '#comps/TokenListMembership'
import { FormattedTimestamp, type TimeFormat } from '#comps/TimeFormat'
import { TxEventDescription } from '#comps/TxEventDescription'
import type { KnownEvent } from '#lib/domain/known-events'
import {
	calculateKnownEventsTotal,
	NORMALIZED_KNOWN_EVENT_TOTAL_DECIMALS,
} from '#lib/domain/known-event-totals'
import { PriceFormatter } from '#lib/formatting'
import { areUsdPricedTokens } from '#lib/pricing'
import { getFeeTokenForChain } from '#lib/tokenlist'
import { getTempoChain } from '#wagmi.config.ts'

const TEMPO_CHAIN_ID = getTempoChain().id
const TEMPO_FEE_TOKEN = getFeeTokenForChain(TEMPO_CHAIN_ID)

export type TransactionData = {
	receipt: TransactionReceipt
	block: GetBlockReturnType
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
	const { isTokenListed } = useTokenListMembership()

	if (!receipt) return <span className="text-tertiary">…</span>

	const feeRaw = Value.format(receipt.effectiveGasPrice * receipt.gasUsed, 18)
	const showUsdPrefix = TEMPO_FEE_TOKEN
		? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
		: true
	const feeDisplay = showUsdPrefix
		? PriceFormatter.format(Number(feeRaw))
		: PriceFormatter.formatAmountShort(feeRaw)

	return <span className="text-tertiary">{feeDisplay}</span>
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
		<TxEventDescription.ExpandGroup
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
	const { isTokenListed } = useTokenListMembership()

	const events = React.useMemo(() => {
		if (!batchData) return
		return batchData.knownEvents.filter((event) => event.type !== 'approval')
	}, [batchData])
	const eventTokens = React.useMemo(
		() =>
			events?.flatMap((event) =>
				event.parts.flatMap((part) =>
					part.type === 'amount' ? [part.value] : [],
				),
			) ?? [],
		[events],
	)
	const showUsdPrefix =
		eventTokens.length > 0
			? areUsdPricedTokens(TEMPO_CHAIN_ID, eventTokens, isTokenListed)
			: TEMPO_FEE_TOKEN
				? isTokenListed(TEMPO_CHAIN_ID, TEMPO_FEE_TOKEN)
				: true

	const infiniteLabel = <span className="text-secondary">−</span>

	if (
		!events?.some((event) => event.parts.some((part) => part.type === 'amount'))
	)
		return (
			<Amount.Base
				value={0n}
				decimals={0}
				prefix={showUsdPrefix ? '$' : undefined}
				short
				infinite={infiniteLabel}
			/>
		)

	const normalizedDecimals = NORMALIZED_KNOWN_EVENT_TOTAL_DECIMALS
	const totalValue = calculateKnownEventsTotal(events)

	if (totalValue === 0n) {
		const value = transaction.value ? Hex.toBigInt(transaction.value) : 0n
		if (value === 0n) return <span className="text-tertiary">—</span>
		return (
			<Amount.Base
				value={value}
				decimals={18}
				infinite={infiniteLabel}
				prefix={showUsdPrefix ? '$' : undefined}
				short
			/>
		)
	}

	return (
		<Amount.Base
			value={totalValue}
			decimals={normalizedDecimals}
			infinite={infiniteLabel}
			prefix={showUsdPrefix ? '$' : undefined}
			short
		/>
	)
}
