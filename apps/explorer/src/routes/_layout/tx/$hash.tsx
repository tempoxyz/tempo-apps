import { queryOptions, useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	rootRouteId,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import { type Address, type Hex, Json, Value } from 'ox'
import * as React from 'react'
import type { Log, TransactionReceipt } from 'viem'
import { useChains } from 'wagmi'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import * as z from 'zod/mini'
import { DecodedCalldata } from '#components/transaction/DecodedCalldata'
import { EventDescription } from '#components/transaction/EventDescription'
import { RawTransaction } from '#components/transaction/receipt/RawTransaction'
import { TransactionCard } from '#components/transaction/TransactionCard'
import { DataGrid } from '#components/ui/DataGrid'
import { NotFound } from '#components/ui/NotFound'
import { Sections } from '#components/ui/Sections'
import { cx } from '#cva.config.ts'
import { type KnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { type FeeBreakdownItem, getFeeBreakdown } from '#lib/domain/receipt'
import * as Tip20 from '#lib/domain/tip20'
import { HexFormatter } from '#lib/formatting'
import { useCopy, useMediaQuery } from '#lib/hooks'
import { zHash } from '#lib/zod'
import { getConfig } from '#wagmi.config'
import CopyIcon from '~icons/lucide/copy'

const defaultSearchValues = {
	tab: 'overview',
} as const

function txQueryOptions(params: { hash: Hex.Hex }) {
	return queryOptions({
		queryKey: ['tx-detail', params.hash],
		queryFn: () => fetchTxData(params),
	})
}

export const Route = createFileRoute('/_layout/tx/$hash')({
	component: RouteComponent,
	notFoundComponent: NotFound,
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
				data: {
					error: error instanceof Error ? error.message : 'Unknown error',
				},
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

	const { block, feeBreakdown, knownEvents, receipt, transaction } = data

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

	const setActiveSection = React.useCallback(
		(newIndex: number) => {
			navigate({
				to: '.',
				search: { tab: tabs[newIndex] ?? 'overview' },
				resetScroll: false,
			})
		},
		[navigate, tabs],
	)

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1080px]',
			)}
		>
			<TransactionCard
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
							<EventsSection logs={receipt.logs} knownEvents={knownEvents} />
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

function OverviewSection(props: {
	receipt: TransactionReceipt
	transaction: Awaited<ReturnType<typeof fetchTxData>>['transaction']
	block: Awaited<ReturnType<typeof fetchTxData>>['block']
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
					<EventDescription.ExpandGroup events={knownEvents} limit={5} />
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

function InfoRow(props: { label: string; children: React.ReactNode }) {
	const { label, children } = props
	return (
		<div className="flex items-start gap-[16px] px-[18px] py-[12px] border-b border-dashed border-card-border last:border-b-0">
			<span className="text-[13px] text-tertiary min-w-[140px] shrink-0">
				{label}
			</span>
			<div className="text-[13px] break-all">{children}</div>
		</div>
	)
}

function InputDataRow(props: { input: Hex.Hex; to?: Address.Address | null }) {
	const { input, to } = props
	const [showRaw, setShowRaw] = React.useState(false)

	return (
		<div className="flex flex-col px-[18px] py-[12px] border-b border-dashed border-card-border last:border-b-0">
			<div className="flex items-start gap-[16px]">
				<span className="text-[13px] text-tertiary min-w-[140px] shrink-0">
					Input Data
				</span>
				<div className="flex flex-col gap-[12px] flex-1">
					<DecodedCalldata address={to} data={input} />
					<div>
						<button
							type="button"
							onClick={() => setShowRaw(!showRaw)}
							className="text-[11px] text-accent hover:underline text-left cursor-pointer"
						>
							{showRaw ? 'Hide' : 'Show'} raw ({input.length} bytes)
						</button>
						{showRaw && (
							<pre className="text-[12px] text-primary break-all whitespace-pre-wrap bg-distinct rounded-[6px] p-[12px] max-h-[300px] overflow-auto mt-[8px]">
								{input}
							</pre>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

function CallsSection(props: {
	calls: ReadonlyArray<{
		to?: Address.Address | null
		data?: Hex.Hex
		value?: bigint
	}>
}) {
	const { calls } = props

	if (calls.length === 0) {
		return (
			<div className="px-[18px] py-[24px] text-[13px] text-tertiary text-center">
				No calls in this transaction
			</div>
		)
	}

	return (
		<div className="flex flex-col divide-y divide-card-border">
			{calls.map((call, i) => (
				<CallItem key={`${call.to}-${i}`} call={call} index={i} />
			))}
		</div>
	)
}

function CallItem(props: {
	call: { to?: Address.Address | null; data?: Hex.Hex; value?: bigint }
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
						{HexFormatter.truncate(call.to, 8)}
					</Link>
				) : (
					<span className="text-tertiary">Contract Creation</span>
				)}
				{data && data !== '0x' && (
					<span className="text-tertiary">({data.length} bytes)</span>
				)}
			</div>
			{data && data !== '0x' && (
				<DecodedCalldata address={call.to} data={data} />
			)}
		</div>
	)
}

function EventsSection(props: { logs: Log[]; knownEvents: KnownEvent[] }) {
	const { logs, knownEvents } = props

	if (logs.length === 0) {
		return (
			<div className="px-[18px] py-[24px] text-[13px] text-tertiary text-center">
				No events emitted in this transaction
			</div>
		)
	}

	const cols = [
		{ label: '#', align: 'start', width: '0.5fr' },
		{ label: 'Event', align: 'start', width: '4fr' },
		{ label: 'Contract', align: 'end', width: '2fr' },
	] satisfies DataGrid.Props['columns']['stacked']

	return (
		<DataGrid
			columns={{ stacked: cols, tabs: cols }}
			items={() =>
				logs.map((log, index) => {
					const knownEvent = knownEvents[index]
					return {
						cells: [
							<span key="index" className="text-tertiary">
								{index}
							</span>,
							<EventCell key="event" log={log} knownEvent={knownEvent} />,
							<Link
								key="contract"
								to="/address/$address"
								params={{ address: log.address }}
								className="text-accent hover:underline whitespace-nowrap"
								title={log.address}
							>
								{HexFormatter.truncate(log.address, 6)}
							</Link>,
						],
					}
				})
			}
			totalItems={logs.length}
			page={1}
			isPending={false}
			itemsLabel="events"
			itemsPerPage={logs.length}
			emptyState="No events emitted."
		/>
	)
}

function EventCell(props: { log: Log; knownEvent?: KnownEvent }) {
	const { log, knownEvent } = props
	const [expanded, setExpanded] = React.useState(false)

	const [eventSignature] = log.topics

	return (
		<div className="flex flex-col gap-[4px]">
			{knownEvent ? (
				<EventDescription
					event={knownEvent}
					className="flex flex-row items-center gap-[6px] leading-[18px]"
				/>
			) : (
				<span className="text-primary">
					{eventSignature
						? HexFormatter.truncate(eventSignature, 8)
						: 'Unknown'}
				</span>
			)}
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="text-[11px] text-accent hover:underline text-left cursor-pointer"
			>
				{expanded ? 'Hide topics' : 'Show topics'}
			</button>
			{expanded && (
				<div className="flex flex-col gap-[2px] mt-[4px]">
					{log.topics.map((topic, i) => (
						<div key={topic} className="flex gap-[8px]">
							<span className="text-[11px] text-tertiary">[{i}]</span>
							<span className="text-[11px] text-primary font-mono break-all">
								{topic}
							</span>
						</div>
					))}
					{log.data && log.data !== '0x' && (
						<div className="flex gap-[8px] mt-[4px]">
							<span className="text-[11px] text-tertiary">data</span>
							<span className="text-[11px] text-primary font-mono break-all max-w-[400px]">
								{log.data}
							</span>
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function RawSection(props: {
	transaction: Awaited<ReturnType<typeof fetchTxData>>['transaction']
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
			<RawTransaction data={rawData} />
		</div>
	)
}
