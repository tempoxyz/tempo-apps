import { queryOptions, useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	rootRouteId,
	stripSearchParams,
	useNavigate,
} from '@tanstack/react-router'
import { type Hex, Json, Value } from 'ox'
import * as React from 'react'
import type { Log, TransactionReceipt } from 'viem'
import { useChains } from 'wagmi'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import * as z from 'zod/mini'
import { DataGrid } from '#components/DataGrid'
import { EventDescription } from '#components/EventDescription'
import { NotFound } from '#components/NotFound'
import { RawTransaction } from '#components/Receipt/RawTransaction'
import { Sections } from '#components/Sections'
import { TransactionCard } from '#components/TransactionCard'
import { cx } from '#cva.config.ts'
import { HexFormatter } from '#lib/formatting'
import { useCopy, useMediaQuery } from '#lib/hooks'
import { type KnownEvent, parseKnownEvents } from '#lib/known-events'
import { type FeeBreakdownItem, getFeeBreakdown } from '#lib/receipt'
import * as Tip20 from '#lib/tip20'
import { zHash } from '#lib/zod'
import { getConfig } from '#wagmi.config'
import CopyIcon from '~icons/lucide/copy'

const defaultSearchValues = {
	tab: 'overview',
} as const

type TabValue = 'overview' | 'events' | 'raw'

function txQueryOptions(params: { hash: Hex.Hex }) {
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

export const Route = createFileRoute('/_layout/tx/$hash')({
	component: Component,
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
			z.enum(['overview', 'events', 'raw']),
			defaultSearchValues.tab,
		),
	}),
	search: {
		middlewares: [stripSearchParams(defaultSearchValues)],
	},
	loader: async ({ params, context }) => {
		const parsedParams = z.object({ hash: zHash() }).safeParse(params)
		if (!parsedParams.success) throw notFound()

		try {
			return await context.queryClient.ensureQueryData(
				txQueryOptions({ hash: parsedParams.data.hash }),
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

function Component() {
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

	const activeSection = tab === 'overview' ? 0 : tab === 'events' ? 1 : 2

	const setActiveSection = React.useCallback(
		(newIndex: number) => {
			const tabs: TabValue[] = ['overview', 'events', 'raw']
			const newTab = tabs[newIndex] ?? 'overview'
			navigate({
				to: '.',
				search: { tab: newTab },
				resetScroll: false,
			})
		},
		[navigate],
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
			{input && input !== '0x' && <InputDataRow input={input} />}
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

function InputDataRow(props: { input: Hex.Hex }) {
	const { input } = props
	const [expanded, setExpanded] = React.useState(false)

	const truncatedInput = input.slice(0, 66) + (input.length > 66 ? '…' : '')

	return (
		<div className="flex flex-col px-[18px] py-[12px] border-b border-dashed border-card-border last:border-b-0">
			<div className="flex items-start gap-[16px]">
				<span className="text-[13px] text-tertiary min-w-[140px] shrink-0">
					Input Data
				</span>
				<div className="flex flex-col gap-[8px] flex-1">
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						className="text-[13px] text-accent hover:underline text-left cursor-pointer"
					>
						{expanded ? 'Hide' : 'Show'} ({input.length} bytes)
					</button>
					{expanded && (
						<pre className="text-[12px] text-primary break-all whitespace-pre-wrap bg-card-header rounded-[6px] p-[12px] max-h-[300px] overflow-auto">
							{input}
						</pre>
					)}
					{!expanded && input.length > 66 && (
						<span className="text-[12px] text-tertiary font-mono">
							{truncatedInput}
						</span>
					)}
				</div>
			</div>
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

	return (
		<DataGrid
			columns={{
				stacked: [
					{ label: '#', align: 'start', width: 48 },
					{ label: 'Event', align: 'start' },
					{ label: 'Contract', align: 'end' },
				],
				tabs: [
					{ label: '#', align: 'start', width: 48 },
					{ label: 'Event', align: 'start' },
					{ label: 'Contract', align: 'end' },
				],
			}}
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
								className="text-accent hover:underline"
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
