import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	rootRouteId,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import type { Address as OxAddress, Hex } from 'ox'
import * as OxAddressUtil from 'ox/Address'
import * as Json from 'ox/Json'
import * as Value from 'ox/Value'
import * as React from 'react'
import { getAbiItem, type Abi, type Log, type TransactionReceipt } from 'viem'
import { Button, TextButton } from '@tempoxyz/ds/platform'
import { useChains } from 'wagmi'
import * as z from 'zod/mini'
import { Address } from '#comps/Address'
import { BreadcrumbsSlot } from '#comps/Breadcrumbs'
import { DataGrid } from '#comps/DataGrid'
import { FeePayer } from '#comps/FeePayer'
import { InfoRow } from '#comps/InfoRow'
import { Midcut } from '#comps/Midcut'
import { NotFound } from '#comps/NotFound'
import { Sections } from '#comps/Sections'
import { TxBalanceChanges } from '#comps/TxBalanceChanges'
import { TxDecodedCalldata } from '#comps/TxDecodedCalldata'
import { TxDecodedTopics } from '#comps/TxDecodedTopics'
import { TxEventDescription, TxEventMemoLine } from '#comps/TxEventDescription'
import { TxRawTransaction } from '#comps/TxRawTransaction'
import { TxStateDiff } from '#comps/TxStateDiff'
import { TxTraceFlamegraph } from '#comps/TxTraceFlamegraph'
import { TxTraceTree, useTraceTree } from '#comps/TxTraceTree'
import { TxTransactionCard } from '#comps/TxTransactionCard'
import { TxKeyAuthorization } from '#comps/TxKeyAuthorization'
import { Empty } from '#comps/ui/Empty'
import { apostrophe } from '#lib/chars'
import type { KnownEvent } from '#lib/domain/known-events'
import { withKeyAuthorizationDescription } from '#lib/domain/access-key'
import { buildTxSummary } from '#lib/domain/tx-summary'
import {
	type EventGroup,
	groupRelatedEvents,
} from '#lib/domain/tx-event-groups'
import type { FeeBreakdownItem } from '#lib/domain/receipt'
import {
	activitiesToKnownEvents,
	selectTransactionDescriptionEvents,
} from '#lib/domain/transaction-activities'
import { PriceFormatter } from '#lib/formatting'
import { useKeyboardShortcut, useMediaQuery } from '#lib/hooks'
import { buildOgImageUrl, buildTxDescription, OG_BASE_URL } from '#lib/og'
import {
	autoloadAbiQueryOptions,
	lookupSignatureQueryOptions,
	type TxData,
	txQueryOptions,
	useAutoloadAbi,
	useLookupSignature,
} from '#lib/queries'
import type { BalanceChangesData } from '#lib/queries/balance-changes'
import {
	balanceChangesQueryOptions,
	LIMIT as BALANCE_CHANGES_LIMIT,
} from '#lib/queries/balance-changes'
import {
	type CallTrace,
	type PrestateDiff,
	traceQueryOptions,
} from '#lib/queries/trace'
import { withLoaderTiming } from '#lib/profiling'
import { zHash } from '#lib/zod'
import { fetchTransactionActivities } from '#lib/server/transaction-activities'
import { link } from '#styles/explorer'
import { styles } from './-$hash.styles'

const defaultSearchValues = {
	tab: 'overview',
	page: 1,
} as const

const EMPTY_BALANCE_CHANGES: BalanceChangesData = {
	changes: [],
	tokenMetadata: {},
	total: 0,
}

const EMPTY_TRACE_DATA = { trace: null, prestate: null } as const

const RECEIVE_POLICY_GUARD = OxAddressUtil.from(
	'0xB10C000000000000000000000000000000000000',
)

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
	loader: ({ params, context }) =>
		withLoaderTiming('/_layout/tx/$hash', async () => {
			const { hash } = params

			try {
				const [txData, activities] = await Promise.all([
					context.queryClient.ensureQueryData(txQueryOptions({ hash })),
					fetchTransactionActivities({ data: { hash } }),
				])

				const activityEvents = activitiesToKnownEvents(activities, {
					portal: txData.receipt.to,
				})
				return { ...txData, activityEvents }
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
		const descriptionEvents = loaderData
			? selectTransactionDescriptionEvents({
					activityEvents: loaderData.activityEvents,
					fallbackEvents: loaderData.knownEvents ?? [],
					knownCalls: loaderData.knownCalls,
				})
			: []
		const ogImageUrl = loaderData
			? buildOgImageUrl(loaderData, params.hash, descriptionEvents)
			: `${OG_BASE_URL}/tx/${params.hash}`
		const description = loaderData
			? buildTxDescription({
					timestamp: Number(loaderData.block.timestamp) * 1000,
					from: loaderData.receipt.from,
					events: descriptionEvents,
				})
			: 'View transaction details on Tempo Explorer.'

		return {
			title,
			meta: [
				{ title },
				{ property: 'og:title', content: title },
				{ property: 'og:description', content: description },
				{ name: 'twitter:description', content: description },
				{ property: 'og:image', content: ogImageUrl },
				{ property: 'og:image:type', content: 'image/webp' },
				{ property: 'og:image:width', content: '1200' },
				{ property: 'og:image:height', content: '630' },
				{ name: 'twitter:card', content: 'summary_large_image' },
				{ name: 'twitter:image', content: ogImageUrl },
			],
		}
	},
})

function RouteComponent() {
	const navigate = useNavigate()
	const { tab, page } = Route.useSearch()
	const {
		activityEvents,
		block,
		feeBreakdown,
		keyAuthorization,
		keyTokenMetadata,
		knownCalls,
		knownEvents,
		knownEventsByLog = [],
		receipt,
		transaction,
	} = Route.useLoaderData()
	const hash = receipt.transactionHash
	const balanceChangesQuery = useQuery({
		...balanceChangesQueryOptions({
			hash,
			limit: BALANCE_CHANGES_LIMIT,
			offset: (page - 1) * BALANCE_CHANGES_LIMIT,
		}),
		enabled: typeof window !== 'undefined',
	})
	const traceQuery = useQuery({
		...traceQueryOptions({ hash }),
		enabled: typeof window !== 'undefined',
	})
	const balanceChangesData = balanceChangesQuery.data ?? EMPTY_BALANCE_CHANGES
	const traceData = traceQuery.data ?? EMPTY_TRACE_DATA

	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'
	const hasBlockedTransfer = knownEvents.some(
		(event) => event.type === 'transfer blocked',
	)
	const displayKnownEvents = knownEvents.filter(
		(event) =>
			!hasBlockedTransfer ||
			event.type !== 'send' ||
			!event.meta?.to ||
			!OxAddressUtil.isEqual(event.meta.to, RECEIVE_POLICY_GUARD),
	)
	const descriptionEvents = selectTransactionDescriptionEvents({
		activityEvents,
		fallbackEvents: displayKnownEvents,
		knownCalls,
	})

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
	const summary = React.useMemo(
		() =>
			buildTxSummary({
				receipt,
				transaction,
				knownEvents: descriptionEvents,
				trace: traceData.trace,
				balanceChangesData,
			}),
		[
			receipt,
			descriptionEvents,
			traceData.trace,
			balanceChangesData,
			transaction,
		],
	)

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
				knownEvents={descriptionEvents}
				keyAuthorization={keyAuthorization}
				keyTokenMetadata={keyTokenMetadata}
				feeBreakdown={feeBreakdown}
				balanceChangesData={balanceChangesData}
				onShowBalances={() =>
					navigate({ to: '.', search: { tab: 'balances' } })
				}
			/>
		),
	})

	tabs.push('balances')
	sections.push({
		title: 'Balances',
		totalItems: balanceChangesData.total,
		itemsLabel: 'balances',
		content: (
			<TxBalanceChanges
				data={balanceChangesData}
				loading={balanceChangesQuery.isPending}
				page={page}
			/>
		),
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
				<TraceSection
					trace={traceData.trace}
					prestate={traceData.prestate}
					receipt={receipt}
					logs={receipt.logs}
					tokenMetadata={balanceChangesData.tokenMetadata}
				/>
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
		<div {...styles.page()}>
			<BreadcrumbsSlot className={styles.breadcrumbs().className} />
			<TxTransactionCard
				hash={receipt.transactionHash}
				status={receipt.status}
				error={summary.error}
				blockNumber={receipt.blockNumber}
				timestamp={block.timestamp}
				from={receipt.from}
				to={receipt.to}
				className={styles.card().className}
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
	keyAuthorization: TxData['keyAuthorization']
	keyTokenMetadata: TxData['keyTokenMetadata']
	feeBreakdown: FeeBreakdownItem[]
	balanceChangesData: BalanceChangesData
	onShowBalances: () => void
}) {
	const {
		receipt,
		transaction,
		block,
		knownEvents,
		keyAuthorization,
		keyTokenMetadata,
		feeBreakdown,
		balanceChangesData,
		onShowBalances,
	} = props

	const [chain] = useChains()
	const { decimals, symbol } = chain.nativeCurrency

	const gasUsed = receipt.gasUsed
	const gasLimit = transaction.gas
	const gasUsedPercentage =
		gasLimit > 0n ? (Number(gasUsed) / Number(gasLimit)) * 100 : 0
	const gasPrice = receipt.effectiveGasPrice
	const baseFee = block.baseFeePerGas
	const maxFee = transaction.maxFeePerGas
	const maxPriorityFee = transaction.maxPriorityFeePerGas
	const nonce = transaction.nonce
	const nonceKey =
		'nonceKey' in transaction
			? (transaction.nonceKey as bigint | undefined)
			: undefined
	const isExpiringNonce = nonceKey === 2n ** 256n - 1n
	const positionInBlock = receipt.transactionIndex
	const input = transaction.input
	const feePayer =
		'feePayer' in receipt &&
		typeof receipt.feePayer === 'string' &&
		OxAddressUtil.validate(receipt.feePayer)
			? receipt.feePayer
			: undefined

	const memos = knownEvents
		.map((event) => event.note)
		.filter((note): note is string => typeof note === 'string' && !!note.trim())

	const description = withKeyAuthorizationDescription(
		knownEvents,
		transaction.from,
		keyAuthorization,
	)

	return (
		<div {...styles.column()}>
			{description.events.length > 0 && (
				<InfoRow label="Description" stackOnMobile={Boolean(keyAuthorization)}>
					<div {...styles.description()}>
						<TxEventDescription.ExpandGroup
							events={description.events}
							renderDetails={(event) =>
								keyAuthorization && event === description.authorizationEvent ? (
									<TxKeyAuthorization.Disclosure
										key={keyAuthorization.address}
										authorization={keyAuthorization}
										tokenMetadata={keyTokenMetadata}
									/>
								) : null
							}
						/>
						{memos.length > 0 && (
							<div {...styles.stack()}>
								{memos.map((memo, index) => (
									<TxEventMemoLine key={`${memo}-${index}`} memo={memo} />
								))}
							</div>
						)}
					</div>
				</InfoRow>
			)}
			{balanceChangesData.total > 0 && (
				<BalanceChangesOverview
					data={balanceChangesData}
					onShowAll={onShowBalances}
				/>
			)}
			<InfoRow label="Transaction Fee">
				{feeBreakdown.length > 0 ? (
					<div {...styles.stack()}>
						{feeBreakdown.map((item, index) => {
							return (
								<span key={`${index}${item.token}`} {...styles.primary()}>
									{Value.format(item.amount, item.decimals)}{' '}
									{item.token ? (
										<Link
											to="/token/$address"
											params={{ address: item.token }}
											{...link()}
										>
											{item.symbol}
										</Link>
									) : (
										item.symbol
									)}
								</span>
							)
						})}
					</div>
				) : (
					<span {...styles.primary()}>
						{Value.format(
							receipt.effectiveGasPrice * receipt.gasUsed,
							decimals,
						)}{' '}
						{symbol}
					</span>
				)}
			</InfoRow>
			{feePayer && (
				<InfoRow label="Fee Payer">
					<FeePayer address={feePayer} />
				</InfoRow>
			)}
			<InfoRow label="Gas Used">
				<span {...styles.primary()}>
					{gasUsed.toLocaleString()} / {gasLimit.toLocaleString()}{' '}
					<span {...styles.secondary()}>({gasUsedPercentage.toFixed(2)}%)</span>
				</span>
			</InfoRow>
			<InfoRow label="Gas Price">
				<span {...styles.primary()}>{gasPrice}</span>
			</InfoRow>
			{baseFee !== undefined && baseFee !== null && (
				<InfoRow label="Base Fee">
					<span {...styles.primary()}>{baseFee}</span>
				</InfoRow>
			)}
			{maxFee !== undefined && (
				<InfoRow label="Max Fee">
					<span {...styles.primary()}>{maxFee}</span>
				</InfoRow>
			)}
			{maxPriorityFee !== undefined && (
				<InfoRow label="Max Priority Fee">
					<span {...styles.primary()}>{maxPriorityFee}</span>
				</InfoRow>
			)}
			<InfoRow label="Transaction Type">
				<span {...styles.primary()}>{receipt.type}</span>
			</InfoRow>
			{isExpiringNonce ? (
				<>
					<InfoRow label="Nonce Key">
						<a
							href="https://docs.tempo.xyz/protocol/tips/tip-1009"
							target="_blank"
							rel="noopener noreferrer"
							{...link()}
						>
							Expiring Nonce
						</a>
					</InfoRow>
					<InfoRow label="Nonce">
						<span {...styles.primary()}>{nonce}</span>
					</InfoRow>
				</>
			) : nonceKey !== undefined ? (
				<>
					<InfoRow label="Nonce Key">
						<span {...styles.primary()}>{nonceKey.toString()}</span>
					</InfoRow>
					<InfoRow label="Nonce">
						<span {...styles.primary()}>{nonce}</span>
					</InfoRow>
				</>
			) : (
				<InfoRow label="Nonce">
					<span {...styles.primary()}>{nonce}</span>
				</InfoRow>
			)}
			<InfoRow label="Position in Block">
				<span {...styles.primary()}>{positionInBlock}</span>
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
		<InfoRow label="Input Data">
			<TxDecodedCalldata address={to} data={input} />
		</InfoRow>
	)
}

function BalanceChangesOverview(props: {
	data: BalanceChangesData
	onShowAll: () => void
}) {
	const { data, onShowAll } = props

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
		<InfoRow label="Balance Updates">
			<div {...styles.balances()}>
				<div {...styles.balanceAccounts()}>
					{Array.from(groupedByAccount.entries()).map(([address, changes]) => (
						<div key={address} {...styles.balanceAccount()}>
							<Address address={address} />
							<div {...styles.balanceChanges()}>
								{changes.map((change) => {
									const metadata = data.tokenMetadata[change.token]

									let diff: bigint
									try {
										diff = BigInt(change.diff)
									} catch {
										return null
									}

									const raw = metadata
										? Value.format(diff, metadata.decimals)
										: change.diff
									const formatted = metadata
										? PriceFormatter.formatAmount(raw)
										: raw

									return (
										<div key={change.token} {...styles.balanceChange()}>
											<TxBalanceChanges.Diff
												value={diff}
												formatted={formatted}
											/>
											<TxBalanceChanges.TokenSymbol
												token={change.token}
												metadata={metadata}
											/>
										</div>
									)
								})}
							</div>
						</div>
					))}
				</div>
				<TextButton onClick={onShowAll} {...styles.seeAll()}>
					See all ({data.total})
				</TextButton>
			</div>
		</InfoRow>
	)
}

function TraceSection(props: {
	trace: CallTrace | null
	prestate: PrestateDiff | null
	receipt: TransactionReceipt
	logs: Log[]
	tokenMetadata: Record<string, { symbol?: string; decimals?: number }>
}): React.JSX.Element {
	const { trace, prestate, receipt, logs, tokenMetadata } = props
	const tree = useTraceTree(trace)

	return (
		<div {...styles.column()}>
			<TxTraceTree trace={trace} tree={tree} />
			<TxStateDiff
				prestate={prestate}
				trace={trace}
				receipt={{ from: receipt.from, to: receipt.to }}
				logs={logs}
				tokenMetadata={tokenMetadata}
			/>
			<TxTraceFlamegraph tree={tree} prestate={prestate} />
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
		<div {...styles.calls()}>
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
		<div {...styles.call()}>
			<div {...styles.callHeader()}>
				<span {...styles.primary()}>#{index}</span>
				{call.to ? (
					<Address address={call.to} />
				) : (
					<span {...styles.secondary()}>Contract Creation</span>
				)}
				{data && data !== '0x' && (
					<span {...styles.secondary()}>({data.length} bytes)</span>
				)}
			</div>
			{data && data !== '0x' && (
				<TxDecodedCalldata address={call.to} data={data} />
			)}
		</div>
	)
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
		return <Empty compact title="No events emitted in this transaction." />

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
							<span key="index" {...styles.secondary()}>
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
							<div {...styles.eventLogs()}>
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
		<div {...styles.eventCell()}>
			{knownEvent ? (
				<TxEventDescription event={knownEvent} />
			) : (
				<EventFallbackName log={logs[0]} />
			)}
			<div>
				<Button
					aria-expanded={expanded}
					onClick={onToggle}
					scale="small"
					variant="secondary"
				>
					{expanded
						? eventCount > 1
							? `Hide details (${eventCount})`
							: 'Hide details'
						: eventCount > 1
							? `Show details (${eventCount})`
							: 'Show details'}
				</Button>
			</div>
		</div>
	)
}

function EventFallbackName(props: { log: Log }) {
	const { log } = props
	const selector = log.topics[0]
	const { data: autoloadAbi } = useAutoloadAbi({
		address: log.address,
		enabled: Boolean(selector),
	})
	const { data: signature } = useLookupSignature({ selector })

	const abiEventName = React.useMemo(() => {
		if (!autoloadAbi || !selector) return undefined
		const item = getAbiItem({
			abi: autoloadAbi as Abi,
			name: selector,
		})
		return item && 'name' in item ? item.name : undefined
	}, [autoloadAbi, selector])
	const signatureEventName = signature?.match(/^([^(]+)/)?.[1]
	const eventName = abiEventName ?? signatureEventName

	return (
		<span {...styles.primary()}>
			{eventName ? (
				eventName.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			) : selector ? (
				<Midcut value={selector} prefix="0x" />
			) : (
				'Unknown'
			)}
		</span>
	)
}

function RawSection(props: {
	transaction: TxData['transaction']
	receipt: TransactionReceipt
}) {
	const { transaction, receipt } = props

	const rawData = Json.stringify({ tx: transaction, receipt }, null, 2)

	return (
		<div {...styles.raw()}>
			<TxRawTransaction data={rawData} />
		</div>
	)
}
