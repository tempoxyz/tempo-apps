import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	rootRouteId,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import { type Hex, Json, type Address as OxAddress, Value } from 'ox'
import * as React from 'react'
import { type Log, type TransactionReceipt, toEventSelector } from 'viem'
import { useChains } from 'wagmi'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { DataGrid } from '#comps/DataGrid'
import { InfoRow } from '#comps/InfoRow'
import { Midcut } from '#comps/Midcut'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import { TxDecodedCalldata } from '#comps/TxDecodedCalldata'
import { TxDecodedTopics } from '#comps/TxDecodedTopics'
import { TxEventDescription } from '#comps/TxEventDescription'
import { TxRawTransaction } from '#comps/TxRawTransaction'
import { TxTransactionCard } from '#comps/TxTransactionCard'
import { cx } from '#cva.config.ts'
import { apostrophe } from '#lib/chars'
import type { KnownEvent } from '#lib/domain/known-events'
import type { FeeBreakdownItem } from '#lib/domain/receipt'
import { useCopy, useMediaQuery } from '#lib/hooks'
import { type TxData, txQueryOptions } from '#lib/queries'
import { zHash } from '#lib/zod'
import CopyIcon from '~icons/lucide/copy'

const defaultSearchValues = {
	tab: 'overview',
} as const

export const Route = createFileRoute('/_layout/tx/$hash')({
	component: RouteComponent,
	notFoundComponent: ({ data }) => (
		<NotFound
			title="Transaction Not Found"
			message={`The transaction doesn${apostrophe}t exist or hasn${apostrophe}t been processed yet.`}
			data={data as NotFound.NotFoundData}
		/>
	),
	headers: () => ({
		...(import.meta.env.PROD
			? {
					'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
				}
			: {}),
	}),
	validateSearch: z.object({
		r: z.optional(z.string()),
		tab: z.prefault(
			z.enum(['overview', 'calls', 'events', 'raw']),
			defaultSearchValues.tab,
		),
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loader: async ({ params, context }) => {
		try {
			return await context.queryClient.ensureQueryData(
				txQueryOptions({ hash: params.hash }),
			)
		} catch (error) {
			console.error(error)
			throw notFound({
				routeId: rootRouteId,
				data: { type: 'hash', value: params.hash },
			})
		}
	},
	params: z.object({
		hash: zHash(),
	}),
})

function RouteComponent() {
	const navigate = useNavigate()
	const { hash } = Route.useParams()
	const { tab } = Route.useSearch()
	const loaderData = Route.useLoaderData()

	const { data } = useQuery({
		...txQueryOptions({ hash }),
		initialData: loaderData,
	})

	const {
		block,
		feeBreakdown,
		knownEvents,
		knownEventsByLog = [],
		receipt,
		transaction,
	} = data

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	const calls = 'calls' in transaction ? transaction.calls : undefined
	const hasCalls = Boolean(calls && calls.length > 0)

	const tabs = [
		'overview',
		...(hasCalls ? ['calls'] : []),
		'events',
		'raw',
	] as const
	const activeSection = tabs.indexOf(tab)

	const setActiveSection = (newIndex: number) => {
		navigate({
			to: '.',
			search: { tab: tabs[newIndex] ?? 'overview' },
			resetScroll: false,
		})
	}

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1080px]',
			)}
		>
			<TxTransactionCard
				hash={receipt.transactionHash}
				status={receipt.status}
				blockNumber={receipt.blockNumber}
				timestamp={block.timestamp}
				from={receipt.from}
				to={receipt.to}
				className="self-start"
			/>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'Overview',
						totalItems: 0,
						itemsLabel: 'fields',
						autoCollapse: false,
						content: (
							<OverviewSection
								receipt={receipt}
								transaction={transaction}
								block={block}
								knownEvents={knownEvents}
								feeBreakdown={feeBreakdown}
							/>
						),
					},
					...(hasCalls && calls
						? [
								{
									title: 'Calls',
									totalItems: calls.length,
									itemsLabel: 'calls',
									content: <CallsSection calls={calls} />,
								},
							]
						: []),
					{
						title: 'Events',
						totalItems: receipt.logs.length,
						itemsLabel: 'events',
						content: (
							<EventsSection
								logs={receipt.logs}
								knownEvents={knownEventsByLog}
							/>
						),
					},
					{
						title: 'Raw',
						totalItems: 0,
						itemsLabel: 'data',
						content: <RawSection transaction={transaction} receipt={receipt} />,
					},
				]}
				activeSection={activeSection}
				onSectionChange={setActiveSection}
			/>
		</div>
	)
}

function OverviewSection(props: {
	receipt: TransactionReceipt
	transaction: TxData['transaction']
	block: TxData['block']
	knownEvents: KnownEvent[]
	feeBreakdown: FeeBreakdownItem[]
}) {
	const { receipt, transaction, block, knownEvents, feeBreakdown } = props

	const [chain] = useChains()
	const { decimals, symbol } = chain.nativeCurrency

	const value = transaction.value ?? 0n
	const gasUsed = receipt.gasUsed
	const gasLimit = transaction.gas
	const gasUsedPercentage =
		gasLimit > 0n ? (Number(gasUsed) / Number(gasLimit)) * 100 : 0
	const gasPrice = receipt.effectiveGasPrice
	const baseFee = block.baseFeePerGas
	const maxFee = transaction.maxFeePerGas
	const maxPriorityFee = transaction.maxPriorityFeePerGas
	const nonce = transaction.nonce
	const positionInBlock = receipt.transactionIndex
	const input = transaction.input

	return (
		<div className="flex flex-col">
			{knownEvents.length > 0 && (
				<InfoRow label="Description">
					<TxEventDescription.ExpandGroup
						events={knownEvents}
						limit={5}
						limitFilter={(event) =>
							event.type !== 'active key count changed' &&
							event.type !== 'nonce incremented'
						}
					/>
				</InfoRow>
			)}
			<InfoRow label="Value">
				<span className="text-primary">
					{Value.format(value, decimals)} {symbol}
				</span>
			</InfoRow>
			<InfoRow label="Transaction Fee">
				{feeBreakdown.length > 0 ? (
					<div className="flex flex-col gap-[4px]">
						{feeBreakdown.map((item, index) => {
							return (
								<span key={`${index}${item.token}`} className="text-primary">
									{Value.format(item.amount, item.decimals)}{' '}
									{item.token ? (
										<Link
											to="/token/$address"
											params={{ address: item.token }}
											className="text-base-content-positive press-down"
										>
											{item.symbol}
										</Link>
									) : (
										<span className="text-base-content-positive">
											{item.symbol}
										</span>
									)}
								</span>
							)
						})}
					</div>
				) : (
					<span className="text-primary">
						{Value.format(
							receipt.effectiveGasPrice * receipt.gasUsed,
							decimals,
						)}{' '}
						{symbol}
					</span>
				)}
			</InfoRow>
			<InfoRow label="Gas Used">
				<span className="text-primary">
					{gasUsed.toLocaleString()} / {gasLimit.toLocaleString()}{' '}
					<span className="text-tertiary">
						({gasUsedPercentage.toFixed(2)}%)
					</span>
				</span>
			</InfoRow>
			<InfoRow label="Gas Price">
				<span className="text-primary">{gasPrice}</span>
			</InfoRow>
			{baseFee !== undefined && baseFee !== null && (
				<InfoRow label="Base Fee">
					<span className="text-primary">{baseFee}</span>
				</InfoRow>
			)}
			{maxFee !== undefined && (
				<InfoRow label="Max Fee">
					<span className="text-primary">{maxFee}</span>
				</InfoRow>
			)}
			{maxPriorityFee !== undefined && (
				<InfoRow label="Max Priority Fee">
					<span className="text-primary">{maxPriorityFee}</span>
				</InfoRow>
			)}
			<InfoRow label="Transaction Type">
				<span className="text-primary">{receipt.type}</span>
			</InfoRow>
			<InfoRow label="Nonce">
				<span className="text-primary">{nonce}</span>
			</InfoRow>
			<InfoRow label="Position in Block">
				<span className="text-primary">{positionInBlock}</span>
			</InfoRow>
			{input && input !== '0x' && (
				<InputDataRow input={input} to={transaction.to} />
			)}
		</div>
	)
}

function InputDataRow(props: {
	input: Hex.Hex
	to?: OxAddress.Address | null
}) {
	const { input, to } = props

	return (
		<div className="flex flex-col px-[18px] py-[12px] border-b border-dashed border-card-border last:border-b-0">
			<div className="flex items-start gap-[16px]">
				<span className="text-[13px] text-tertiary min-w-[140px] shrink-0">
					Input Data
				</span>
				<div className="flex-1">
					<TxDecodedCalldata address={to} data={input} />
				</div>
			</div>
		</div>
	)
}

function CallsSection(props: {
	calls: ReadonlyArray<{
		to?: OxAddress.Address | null
		data?: Hex.Hex
		value?: bigint
	}>
}) {
	const { calls } = props
	return calls.length === 0 ? (
		<div className="px-[18px] py-[24px] text-[13px] text-tertiary text-center">
			No calls in this transaction
		</div>
	) : (
		<div className="flex flex-col divide-y divide-card-border">
			{calls.map((call, i) => (
				<CallItem key={`${call.to}-${i}`} call={call} index={i} />
			))}
		</div>
	)
}

function CallItem(props: {
	call: {
		to?: OxAddress.Address | null
		data?: Hex.Hex
		value?: bigint
	}
	index: number
}) {
	const { call, index } = props
	const data = call.data
	return (
		<div className="flex flex-col gap-[12px] px-[18px] py-[16px]">
			<div className="flex items-center gap-[8px] text-[13px] font-mono">
				<span className="text-primary">#{index}</span>
				{call.to ? (
					<Link
						to="/address/$address"
						params={{ address: call.to }}
						className="text-accent hover:underline press-down"
					>
						<Midcut value={call.to} prefix="0x" />
					</Link>
				) : (
					<span className="text-tertiary">Contract Creation</span>
				)}
				{data && data !== '0x' && (
					<span className="text-tertiary">({data.length} bytes)</span>
				)}
			</div>
			{data && data !== '0x' && (
				<TxDecodedCalldata address={call.to} data={data} />
			)}
		</div>
	)
}

type EventGroup = {
	logs: Log[]
	startIndex: number
	knownEvent: KnownEvent | null
}

function groupRelatedEvents(
	logs: Log[],
	knownEvents: (KnownEvent | null)[],
): EventGroup[] {
	const groups: EventGroup[] = []
	let i = 0

	while (i < logs.length) {
		const log = logs[i]
		const event = knownEvents[i]
		const eventName = getEventName(log)

		// Transfer = possible group
		if (eventName === 'Transfer') {
			const secondLog = logs[i + 1]
			const secondEventName = secondLog ? getEventName(secondLog) : null

			// Transfer + Mint or Transfer + Burn (+ optional TransferWithMemo)
			if (secondEventName === 'Mint' || secondEventName === 'Burn') {
				const thirdLog = logs[i + 2]
				const thirdEventName = thirdLog ? getEventName(thirdLog) : null

				// check for mintWithMemo / burnWithMemo pattern (3 events)
				if (thirdEventName === 'TransferWithMemo') {
					groups.push({
						logs: [log, secondLog, thirdLog],
						startIndex: i,
						knownEvent: knownEvents[i + 1], // use Mint / Burn as primary
					})
					i += 3
					continue
				}

				// Transfer + Mint / Burn (2 events)
				groups.push({
					logs: [log, secondLog],
					startIndex: i,
					knownEvent: knownEvents[i + 1], // use Mint / Burn as primary
				})
				i += 2
				continue
			}

			// Transfer + TransferWithMemo
			if (secondEventName === 'TransferWithMemo') {
				groups.push({
					logs: [log, secondLog],
					startIndex: i,
					knownEvent: knownEvents[i + 1], // use TransferWithMemo as primary
				})
				i += 2
				continue
			}
		}

		// single event
		groups.push({
			logs: [log],
			startIndex: i,
			knownEvent: event,
		})
		i++
	}

	return groups
}

const eventSignatures = {
	Transfer: toEventSelector(
		'event Transfer(address indexed, address indexed, uint256)',
	),
	TransferWithMemo: toEventSelector(
		'event TransferWithMemo(address indexed, address indexed, uint256, bytes32 indexed)',
	),
	Mint: toEventSelector('event Mint(address indexed, uint256)'),
	Burn: toEventSelector('event Burn(address indexed, uint256)'),
}

function getEventName(log: Log): string | null {
	const topic0 = log.topics[0]?.toLowerCase()
	if (topic0 === eventSignatures.Transfer.toLowerCase()) return 'Transfer'
	if (topic0 === eventSignatures.TransferWithMemo.toLowerCase())
		return 'TransferWithMemo'
	if (topic0 === eventSignatures.Mint.toLowerCase()) return 'Mint'
	if (topic0 === eventSignatures.Burn.toLowerCase()) return 'Burn'
	return null
}

function EventsSection(props: {
	logs: Log[]
	knownEvents: (KnownEvent | null)[]
}) {
	const { logs, knownEvents } = props
	const [expandedGroups, setExpandedGroups] = React.useState<Set<number>>(
		new Set(),
	)

	const groups = React.useMemo(
		() => groupRelatedEvents(logs, knownEvents),
		[logs, knownEvents],
	)

	const toggleGroup = (groupIndex: number) => {
		setExpandedGroups((expanded) => {
			const newExpanded = new Set(expanded)
			if (newExpanded.has(groupIndex)) newExpanded.delete(groupIndex)
			else newExpanded.add(groupIndex)
			return newExpanded
		})
	}

	if (logs.length === 0)
		return (
			<div className="px-[18px] py-[24px] text-[13px] text-tertiary text-center">
				No events emitted in this transaction
			</div>
		)

	const cols = [
		{ label: '#', align: 'start', width: '0.5fr' },
		{ label: 'Event', align: 'start', width: '4fr' },
		{ label: 'Contract', align: 'end', width: '2fr' },
	] satisfies DataGrid.Props['columns']['stacked']

	return (
		<DataGrid
			columns={{ stacked: cols, tabs: cols }}
			items={() =>
				groups.map((group, groupIndex) => {
					const isExpanded = expandedGroups.has(groupIndex)
					const endIndex = group.startIndex + group.logs.length - 1
					const indexLabel =
						group.logs.length === 1
							? String(group.startIndex)
							: `${group.startIndex}-${endIndex}`

					return {
						cells: [
							<span key="index" className="text-tertiary">
								{indexLabel}
							</span>,
							<EventGroupCell
								key="event"
								group={group}
								expanded={isExpanded}
								onToggle={() => toggleGroup(groupIndex)}
							/>,
							<Address
								align="end"
								key="contract"
								address={group.logs[0].address}
							/>,
						],
						expanded: isExpanded ? (
							<div className="flex flex-col gap-4">
								{group.logs.map((log, i) => (
									<TxDecodedTopics key={log.logIndex ?? i} log={log} />
								))}
							</div>
						) : (
							false
						),
					}
				})
			}
			totalItems={groups.length}
			page={1}
			isPending={false}
			itemsLabel="events"
			itemsPerPage={groups.length}
			emptyState="No events emitted."
		/>
	)
}

function EventGroupCell(props: {
	group: EventGroup
	expanded: boolean
	onToggle: () => void
}) {
	const { group, expanded, onToggle } = props
	const { knownEvent, logs } = group
	const eventCount = logs.length

	return (
		<div className="flex flex-col gap-[4px] w-full">
			{knownEvent ? (
				<TxEventDescription
					event={knownEvent}
					className="flex flex-row items-center gap-[6px] leading-[18px]"
				/>
			) : (
				<span className="text-primary">
					{logs[0].topics[0] ? (
						<Midcut value={logs[0].topics[0]} prefix="0x" />
					) : (
						'Unknown'
					)}
				</span>
			)}
			<div>
				<button
					type="button"
					onClick={onToggle}
					className="text-[11px] text-accent hover:underline text-left cursor-pointer press-down-mini"
				>
					{expanded
						? eventCount > 1
							? `Hide details (${eventCount})`
							: 'Hide details'
						: eventCount > 1
							? `Show details (${eventCount})`
							: 'Show details'}
				</button>
			</div>
		</div>
	)
}

function RawSection(props: {
	transaction: TxData['transaction']
	receipt: TransactionReceipt
}) {
	const { transaction, receipt } = props
	const { copy, notifying } = useCopy()

	const rawData = Json.stringify({ tx: transaction, receipt }, null, 2)

	return (
		<div className="relative px-[18px] py-[12px] text-[13px] break-all">
			<div className="absolute top-[12px] right-[18px] flex items-center gap-[4px] text-tertiary">
				{notifying && <span className="text-[11px] select-none">copied</span>}
				<button
					type="button"
					className="press-down cursor-pointer hover:text-secondary p-[4px]"
					onClick={() => copy(rawData)}
					title="Copy"
				>
					<CopyIcon className="size-[14px]" />
				</button>
			</div>
			<TxRawTransaction data={rawData} />
		</div>
	)
}
