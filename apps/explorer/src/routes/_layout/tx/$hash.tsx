import { useQueryClient } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	rootRouteId,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import type { Address as OxAddress, Hex } from 'ox'
import * as Json from 'ox/Json'
import * as Value from 'ox/Value'
import * as React from 'react'
import type { Log, TransactionReceipt } from 'viem'
import { toEventSelector } from 'viem'
import { useChains } from 'wagmi'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { DataGrid } from '#comps/DataGrid'
import { InfoRow } from '#comps/InfoRow'
import { Midcut } from '#comps/Midcut'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import { TokenIcon } from '#comps/TokenIcon'
import { TxBalanceChanges } from '#comps/TxBalanceChanges'
import { TxDecodedCalldata } from '#comps/TxDecodedCalldata'
import { TxDecodedTopics } from '#comps/TxDecodedTopics'
import { TxEventDescription } from '#comps/TxEventDescription'
import { TxRawTransaction } from '#comps/TxRawTransaction'
import { TxStateDiff } from '#comps/TxStateDiff'
import { TxTraceTree } from '#comps/TxTraceTree'
import { TxTransactionCard } from '#comps/TxTransactionCard'
import { cx } from '#lib/css'
import { apostrophe } from '#lib/chars'
import type { KnownEvent } from '#lib/domain/known-events'
import type { FeeBreakdownItem } from '#lib/domain/receipt'
import { isTip20Address } from '#lib/domain/tip20'
import { PriceFormatter } from '#lib/formatting'
import { useKeyboardShortcut, useMediaQuery } from '#lib/hooks'
import { buildOgImageUrl, buildTxDescription } from '#lib/og'
import {
	autoloadAbiQueryOptions,
	LIMIT,
	lookupSignatureQueryOptions,
	type TxData,
	txQueryOptions,
} from '#lib/queries'
import type { BalanceChangesData } from '#lib/queries/balance-changes'
import { traceQueryOptions } from '#lib/queries/trace'
import { withLoaderTiming } from '#lib/profiling'
import { zHash } from '#lib/zod'
import { fetchBalanceChanges } from '#routes/api/tx/balance-changes/$hash'
import ChevronDownIcon from '~icons/lucide/chevron-down'

const defaultSearchValues = {
	tab: 'overview',
	page: 1,
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
			z.enum(['overview', 'calls', 'trace', 'events', 'balances', 'raw']),
			defaultSearchValues.tab,
		),
		page: z.prefault(z.coerce.number(), defaultSearchValues.page),
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loaderDeps: ({ search: { page } }) => ({ page }),
	loader: ({ params, context, deps: { page } }) =>
		withLoaderTiming('/_layout/tx/$hash', async () => {
			const { hash } = params

			try {
				const offset = (page - 1) * LIMIT

				const [txData, balanceChangesData, traceData] = await Promise.all([
					context.queryClient.ensureQueryData(txQueryOptions({ hash })),
					fetchBalanceChanges({ hash, limit: LIMIT, offset }).catch(() => ({
						changes: [],
						tokenMetadata: {},
						total: 0,
					})),
					context.queryClient
						.ensureQueryData(traceQueryOptions({ hash }))
						.catch(() => ({ trace: null, prestate: null })),
				])

				return { ...txData, balanceChangesData, traceData }
			} catch (error) {
				console.error(error)
				throw notFound({
					routeId: rootRouteId,
					data: { type: 'hash', value: hash },
				})
			}
		}),
	params: z.object({
		hash: zHash(),
	}),
	head: ({ params, loaderData }) => {
		const title = `Transaction ${params.hash.slice(0, 10)}…${params.hash.slice(-6)} ⋅ Tempo Explorer`
		const ogImageUrl = loaderData
			? buildOgImageUrl(loaderData, params.hash)
			: undefined
		const description = loaderData
			? buildTxDescription({
					timestamp: Number(loaderData.block.timestamp) * 1000,
					from: loaderData.receipt.from,
					events: loaderData.knownEvents ?? [],
				})
			: 'View transaction details on Tempo Explorer.'

		return {
			title,
			meta: [
				{ title },
				{ property: 'og:title', content: title },
				{ property: 'og:description', content: description },
				{ name: 'twitter:description', content: description },
				...(ogImageUrl
					? [
							{ property: 'og:image', content: ogImageUrl },
							{ property: 'og:image:type', content: 'image/webp' },
							{ property: 'og:image:width', content: '1200' },
							{ property: 'og:image:height', content: '630' },
							{ name: 'twitter:card', content: 'summary_large_image' },
							{ name: 'twitter:image', content: ogImageUrl },
						]
					: []),
			],
		}
	},
})

function RouteComponent() {
	const navigate = useNavigate()
	const { tab, page } = Route.useSearch()
	const {
		balanceChangesData,
		traceData,
		block,
		feeBreakdown,
		knownEvents,
		knownEventsByLog = [],
		receipt,
		transaction,
	} = Route.useLoaderData()

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	useKeyboardShortcut({
		t: () =>
			navigate({
				to: '/receipt/$hash',
				params: { hash: receipt.transactionHash },
			}),
	})

	const calls =
		transaction && 'calls' in transaction && Array.isArray(transaction.calls)
			? (transaction.calls as Array<{
					to?: OxAddress.Address | null
					data?: Hex.Hex
					value?: bigint
				}>)
			: undefined
	const hasCalls = Boolean(calls && calls.length > 0)

	const setActiveSection = (newIndex: number) => {
		navigate({
			to: '.',
			search: { tab: tabs[newIndex] ?? 'overview' },
			resetScroll: false,
		})
	}

	const tabs: string[] = []
	const sections: Sections.Section[] = []

	tabs.push('overview')
	sections.push({
		title: 'Overview',
		itemsLabel: 'fields',
		autoCollapse: false,
		content: (
			<OverviewSection
				receipt={receipt}
				transaction={transaction}
				block={block}
				knownEvents={knownEvents}
				feeBreakdown={feeBreakdown}
				balanceChangesData={balanceChangesData}
			/>
		),
	})

	tabs.push('balances')
	sections.push({
		title: 'Balances',
		totalItems: balanceChangesData.total,
		itemsLabel: 'balances',
		content: <TxBalanceChanges data={balanceChangesData} page={page} />,
	})

	if (hasCalls && calls) {
		tabs.push('calls')
		sections.push({
			title: 'Calls',
			totalItems: calls.length,
			itemsLabel: 'calls',
			content: <CallsSection calls={calls} />,
		})
	}

	tabs.push('events')
	sections.push({
		title: 'Events',
		totalItems: receipt.logs.length,
		itemsLabel: 'events',
		content: (
			<EventsSection logs={receipt.logs} knownEvents={knownEventsByLog} />
		),
	})

	if (traceData.trace || traceData.prestate) {
		tabs.push('trace')
		sections.push({
			title: 'Trace',
			itemsLabel: 'views',
			content: (
				<div className="flex flex-col">
					<TxTraceTree trace={traceData.trace} />
					<TxStateDiff
						prestate={traceData.prestate}
						trace={traceData.trace}
						receipt={{ from: receipt.from, to: receipt.to }}
						logs={receipt.logs}
						tokenMetadata={balanceChangesData.tokenMetadata}
					/>
				</div>
			),
		})
	}

	tabs.push('raw')
	sections.push({
		title: 'Raw',
		totalItems: 0,
		itemsLabel: 'data',
		content: <RawSection transaction={transaction} receipt={receipt} />,
	})

	const tabIndex = tabs.indexOf(tab)
	const activeSection = tabIndex !== -1 ? tabIndex : 0

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1080px]',
			)}
		>
			<BreadcrumbsSlot className="col-span-full" />
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
				sections={sections}
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
	balanceChangesData: BalanceChangesData
}) {
	const {
		receipt,
		transaction,
		block,
		knownEvents,
		feeBreakdown,
		balanceChangesData,
	} = props

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

	const memos = knownEvents
		.map((event) => event.note)
		.filter((note): note is string => typeof note === 'string' && !!note.trim())

	// knownEvents already has decoded calls prepended (from the loader)

	return (
		<div className="flex flex-col">
			{knownEvents.length > 0 && (
				<InfoRow label="Description">
					<div className="flex flex-col gap-[6px]">
						<TxEventDescription.ExpandGroup
							events={knownEvents}
							limit={5}
							limitFilter={(event) =>
								event.type !== 'active key count changed' &&
								event.type !== 'nonce incremented'
							}
						/>
						{memos.length > 0 && (
							<div className="flex flex-row items-center gap-[11px] overflow-hidden">
								<div className="border-l border-base-border pl-[10px] w-full">
									<span
										className="text-tertiary items-end overflow-hidden text-ellipsis whitespace-nowrap"
										title={memos[0]}
									>
										{memos[0]}
									</span>
								</div>
							</div>
						)}
					</div>
				</InfoRow>
			)}
			{balanceChangesData.total > 0 && (
				<BalanceChangesOverview data={balanceChangesData} />
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

function BalanceChangesOverview(props: { data: BalanceChangesData }) {
	const { data } = props

	const groupedByAccount = React.useMemo(() => {
		const grouped = new Map<
			OxAddress.Address,
			Array<(typeof data.changes)[number]>
		>()
		for (const change of data.changes) {
			const existing = grouped.get(change.address)
			if (existing) existing.push(change)
			else grouped.set(change.address, [change])
		}
		return grouped
	}, [data.changes])

	return (
		<div className="flex flex-col px-[18px] py-[12px] border-b border-dashed border-card-border">
			<div className="flex items-start gap-[16px]">
				<span className="text-[13px] text-tertiary min-w-[140px] shrink-0">
					Balance Updates
				</span>
				<div className="flex flex-col gap-[4px] flex-1 min-w-0">
					<div className="flex flex-col gap-[12px] max-h-[360px] overflow-y-auto pb-[8px] font-mono">
						{Array.from(groupedByAccount.entries()).map(
							([address, changes]) => (
								<div
									key={address}
									className="flex flex-col gap-[4px] text-[13px]"
								>
									<Address address={address} />
									<div className="flex flex-col gap-[2px] pl-[12px] border-l border-base-border">
										{changes.map((change) => {
											const metadata = data.tokenMetadata[change.token]
											const isTip20 = isTip20Address(change.token)

											let diff: bigint
											try {
												diff = BigInt(change.diff)
											} catch {
												return null
											}

											const isPositive = diff > 0n
											const raw = metadata
												? Value.format(diff, metadata.decimals)
												: change.diff
											const formatted = metadata
												? PriceFormatter.formatAmount(raw)
												: raw

											return (
												<div
													key={change.token}
													className="flex items-center gap-[8px]"
												>
													<span
														className={cx(
															'shrink-0 tabular-nums',
															isPositive
																? 'text-base-content-positive'
																: 'text-secondary',
														)}
													>
														{isPositive ? '+' : ''}
														{formatted}
													</span>
													<Link
														className="inline-flex items-center gap-[4px] text-base-content-positive press-down shrink-0"
														params={{ address: change.token }}
														to={
															isTip20 ? '/token/$address' : '/address/$address'
														}
													>
														<TokenIcon
															address={change.token}
															name={metadata?.symbol}
															className="size-[16px]!"
														/>
														<span>{metadata?.symbol ?? '…'}</span>
													</Link>
												</div>
											)
										})}
									</div>
								</div>
							),
						)}
					</div>
					<Link
						to="."
						search={{ tab: 'balances' }}
						className="inline-flex items-center gap-[4px] text-[11px] text-accent bg-accent/10 hover:bg-accent/15 rounded-full px-[10px] py-[4px] press-down w-fit"
					>
						See all ({data.total})
						<ChevronDownIcon className="size-[12px]" />
					</Link>
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
	return (
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
			<div className="flex items-center gap-[8px] text-[13px]">
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
	const queryClient = useQueryClient()
	const [expandedGroups, setExpandedGroups] = React.useState<Set<number>>(
		new Set(),
	)

	const groups = React.useMemo(
		() => groupRelatedEvents(logs, knownEvents),
		[logs, knownEvents],
	)

	// Only prefetch once when component mounts, using current logs/queryClient
	// biome-ignore lint/correctness/useExhaustiveDependencies: logs and queryClient are stable from SSR
	React.useEffect(() => {
		for (const log of logs) {
			const [eventSelector] = log.topics
			if (eventSelector) {
				queryClient.prefetchQuery(
					autoloadAbiQueryOptions({ address: log.address }),
				)
				queryClient.prefetchQuery(
					lookupSignatureQueryOptions({ selector: eventSelector }),
				)
			}
		}
	}, [])

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
					className="inline-flex items-center gap-[4px] text-[11px] text-accent bg-accent/10 hover:bg-accent/15 rounded-full px-[10px] py-[4px] press-down cursor-pointer"
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

	const rawData = Json.stringify({ tx: transaction, receipt }, null, 2)

	return (
		<div className="px-[18px] py-[12px] text-[13px] break-all">
			<TxRawTransaction data={rawData} />
		</div>
	)
}
