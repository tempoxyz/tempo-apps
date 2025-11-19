import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useRouter,
	useRouterState,
} from '@tanstack/react-router'
import { Address, Hex, Value } from 'ox'
import * as React from 'react'
import { Hooks } from 'tempo.ts/wagmi'
import type { RpcTransaction as Transaction, TransactionReceipt } from 'viem'
import { formatUnits } from 'viem'
import {
	getBlockQueryOptions,
	getTransactionReceiptQueryOptions,
} from 'wagmi/query'
import * as z from 'zod/mini'
import { AccountCard } from '#components/Account.tsx'
import { EventDescription } from '#components/EventDescription.tsx'
import { NotFound } from '#components/NotFound.tsx'
import { RelativeTime } from '#components/RelativeTime.tsx'
import { Sections } from '#components/Sections.tsx'
import { HexFormatter, PriceFormatter } from '#lib/formatting.ts'
import { useMediaQuery } from '#lib/hooks.ts'
import {
	type KnownEvent,
	type KnownEventPart,
	parseKnownEvents,
} from '#lib/known-events.ts'
import { TokenMetadata } from '#lib/token-metadata.ts'
import { fetchAccountTotalValue } from '#server/account/fetch-account-total-value.ts'
import {
	fetchAccountTransactions,
	type TransactionsApiResponse,
} from '#server/account/fetch-account-transactions.ts'
import { config } from '#wagmi.config.ts'

const rowsPerPage = 10
const ACCOUNT_ACTIVITY_LATEST_KEY = 'account-activity-latest'
const ACCOUNT_ACTIVITY_EARLIEST_KEY = 'account-activity-earliest'

export const Route = createFileRoute('/_layout/account/$address')({
	component: RouteComponent,
	notFoundComponent: NotFound,
	validateSearch: z.object({
		page: z.prefault(z.number(), 1),
		limit: z.prefault(
			z.pipe(
				z.number(),
				z.transform((val) => Math.min(100, val)),
			),
			rowsPerPage,
		),
		tab: z.prefault(z.enum(['history', 'assets']), 'history'),
	}),
	loaderDeps: ({ search: { page, limit } }) => ({ page, limit }),
	loader: async ({ deps: { page, limit }, params, context }) => {
		const { address } = params
		if (!Address.validate(address)) throw notFound()

		const offset = (page - 1) * limit

		const pageOptions = transactionsQueryOptions({
			address,
			page,
			limit,
			offset,
		})
		const latestOptions = transactionsQueryOptions({
			address,
			page: 1,
			limit: 1,
			offset: 0,
			_key: ACCOUNT_ACTIVITY_LATEST_KEY,
		})

		const [pageData, latestData] = await Promise.all([
			context.queryClient.fetchQuery(pageOptions),
			context.queryClient.fetchQuery(latestOptions),
		])

		const totalTransactions = latestData.total ?? pageData.total ?? 0
		let earliestData: TransactionsResponse | undefined
		if (totalTransactions > 0) {
			const lastPageOffset = Math.max(0, totalTransactions - 1)
			earliestData = await context.queryClient.fetchQuery(
				transactionsQueryOptions({
					address,
					page: Math.max(1, Math.ceil(totalTransactions)),
					limit: 1,
					offset: lastPageOffset,
					_key: ACCOUNT_ACTIVITY_EARLIEST_KEY,
				}),
			)
		}

		return {
			pageData,
			lastActivityData: latestData,
			createdData: earliestData,
		}
	},
})

const assets = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c0000000000000000000000000000000000001',
	'0x20c0000000000000000000000000000000000002',
	'0x20c0000000000000000000000000000000000003',
] as const

function RouteComponent() {
	const navigate = useNavigate()
	const route = useRouter()
	const { address } = Route.useParams()
	const { page, tab, limit } = Route.useSearch()

	Address.assert(address)

	React.useEffect(() => {
		// preload pages around the active page (3 before and 3 after)
		for (let i = -3; i <= 3; i++) {
			if (i === 0) continue // skip current page
			const preloadPage = page + i
			if (preloadPage < 1) continue // only preload valid page numbers
			route.preloadRoute({ to: '.', search: { page: preloadPage, tab, limit } })
		}
	}, [route, page, tab, limit])

	const goToPage = React.useCallback(
		(newPage: number) => {
			navigate({
				to: '.',
				search: { page: newPage, tab, limit },
				resetScroll: false,
			})
		},
		[navigate, tab, limit],
	)

	const setActiveSection = React.useCallback(
		(newIndex: number) => {
			const newTab = newIndex === 0 ? 'history' : 'assets'
			navigate({
				to: '.',
				search: { page, tab: newTab, limit },
				resetScroll: false,
			})
		},
		[navigate, page, limit],
	)

	return (
		<div className="flex flex-col min-[1240px]:grid max-w-[1080px] w-full min-[1240px]:pt-20 pt-10 min-[1240px]:pb-16 pb-8 px-4 gap-[14px] min-w-0 min-[1240px]:grid-cols-[auto_1fr]">
			<AccountCardWithTimestamps address={address} />
			<SectionsWrapper
				address={address}
				page={page}
				limit={limit}
				goToPage={goToPage}
				activeSection={tab === 'history' ? 0 : 1}
				onSectionChange={setActiveSection}
			/>
		</div>
	)
}

type TransactionQuery = {
	address: Address.Address
	page: number
	limit: number
	offset: number
	_key?: string | undefined
	include?: 'all' | 'sent' | 'received'
	sort?: 'asc' | 'desc'
}

type TransactionWithMeta = Transaction & {
	block: { timestamp: bigint }
	receipt: TransactionReceipt & { chainId: 42429 }
}

type TransactionsResponse = {
	transactions: Array<TransactionWithMeta>
	knownEvents: Record<Hex.Hex, KnownEvent[]>
} & Omit<TransactionsApiResponse, 'transactions'>

type AccountRouteLoaderData = {
	pageData: TransactionsResponse
	lastActivityData?: TransactionsResponse
	createdData?: TransactionsResponse
}

function transactionsQueryOptions(params: TransactionQuery) {
	return queryOptions({
		queryKey: [
			'account-transactions',
			params.address,
			params.page,
			params.limit,
			params._key,
			params.include,
			params.sort,
		],
		queryFn: async ({ client }) => {
			const include = params.include ?? 'all'
			const sort = params.sort ?? 'desc'
			const data = await fetchAccountTransactions({
				data: {
					address: params.address,
					offset: params.offset,
					limit: params.limit,
					include,
					sort,
				},
			})
			const knownEvents: Record<Hex.Hex, KnownEvent[]> = {}
			const transactions = await Promise.all(
				data.transactions.map(async (transaction) => {
					const [receipt, block] = await Promise.all([
						client.fetchQuery(
							getTransactionReceiptQueryOptions(config, {
								hash: transaction.hash,
							}),
						),
						client.fetchQuery(
							getBlockQueryOptions(config, {
								blockNumber: transaction.blockNumber
									? Hex.toBigInt(transaction.blockNumber)
									: undefined,
							}),
						),
					])
					const tokenMetadata = await TokenMetadata.fromLogs(receipt.logs)
					knownEvents[transaction.hash] = parseKnownEvents(receipt, {
						transaction,
						tokenMetadata,
					})
					return {
						...transaction,
						block,
						receipt,
					} satisfies TransactionWithMeta
				}),
			)
			return {
				...data,
				transactions,
				knownEvents,
			} satisfies TransactionsResponse
		},
		// auto-refresh page 1 since new transactions appear there
		refetchInterval: params.page === 1 ? 4_000 : false,
		refetchIntervalInBackground: params.page === 1,
		refetchOnWindowFocus: params.page === 1,
		placeholderData: keepPreviousData,
	})
}

function AccountCardWithTimestamps(props: { address: Address.Address }) {
	const { address } = props

	const { lastActivityData: loaderLastActivity, createdData: loaderCreated } =
		Route.useLoaderData() as AccountRouteLoaderData

	const latestQueryOptions = transactionsQueryOptions({
		address,
		page: 1,
		limit: 1,
		offset: 0,
		_key: ACCOUNT_ACTIVITY_LATEST_KEY,
	})
	const { data: recentData } = useQuery({
		...latestQueryOptions,
		...(loaderLastActivity ? { initialData: loaderLastActivity } : {}),
	})

	const totalTransactions =
		recentData?.total ?? loaderLastActivity?.total ?? loaderCreated?.total ?? 0
	const lastPageOffset = Math.max(0, totalTransactions - 1)
	const lastPageNumber =
		totalTransactions > 0 ? Math.max(1, Math.ceil(totalTransactions)) : 1

	const earliestQueryOptions = transactionsQueryOptions({
		address,
		page: lastPageNumber,
		limit: 1,
		offset: lastPageOffset,
		_key: ACCOUNT_ACTIVITY_EARLIEST_KEY,
	})
	const { data: oldestData } = useQuery({
		...earliestQueryOptions,
		enabled: totalTransactions > 0,
		...(loaderCreated ? { initialData: loaderCreated } : {}),
	})

	const lastActivityTimestamp = recentData?.transactions?.at(0)?.block.timestamp
	const createdTimestamp = oldestData?.transactions?.at(0)?.block.timestamp

	// Calculate total holdings value
	const totalValue = useAccountTotalValue(address)

	return (
		<AccountCard
			address={address}
			className="self-start"
			createdTimestamp={createdTimestamp}
			lastActivityTimestamp={lastActivityTimestamp}
			totalValue={totalValue.data}
		/>
	)
}

function SectionsSkeleton({ totalItems }: { totalItems: number }) {
	const isMobile = useMediaQuery('(max-width: 1239px)')
	return (
		<Sections
			mode={isMobile ? 'stacked' : 'tabs'}
			sections={[
				{
					title: 'History',
					columns: {
						stacked: [
							{ label: 'Time', align: 'start', minWidth: 100 },
							{ label: 'Hash', align: 'start' },
							{ label: 'Total', align: 'end' },
						],
						tabs: [
							{ label: 'Time', align: 'start', minWidth: 100 },
							{ label: 'Description', align: 'start' },
							{ label: 'Hash', align: 'end' },
							{ label: 'Fee', align: 'end' },
							{ label: 'Total', align: 'end' },
						],
					},
					items: (mode) =>
						Array.from({ length: rowsPerPage }, (_, index) => {
							const key = `skeleton-${index}`
							return mode === 'stacked'
								? [
										<div key={`${key}-time`} className="h-5" />,
										<div key={`${key}-hash`} className="h-5" />,
										<div key={`${key}-total`} className="h-5" />,
									]
								: [
										<div key={`${key}-time`} className="h-5" />,
										<div key={`${key}-desc`} className="h-5" />,
										<div key={`${key}-hash`} className="h-5" />,
										<div key={`${key}-fee`} className="h-5" />,
										<div key={`${key}-total`} className="h-5" />,
									]
						}),
					totalItems,
					page: 1,
					isPending: false,
					onPageChange: () => {},
					itemsLabel: 'transactions',
					itemsPerPage: rowsPerPage,
				},
				{
					title: 'Assets',
					columns: {
						stacked: [
							{ label: 'Name', align: 'start' },
							{ label: 'Balance', align: 'end' },
						],
						tabs: [
							{ label: 'Name', align: 'start' },
							{ label: 'Ticker', align: 'start' },
							{ label: 'Balance', align: 'end' },
							{ label: 'Value', align: 'end' },
						],
					},
					items: () => [],
					totalItems: 0,
					page: 1,
					isPending: false,
					onPageChange: () => {},
					itemsLabel: 'assets',
				},
			]}
			activeSection={0}
			onSectionChange={() => {}}
		/>
	)
}

function useAccountTotalValue(address: Address.Address) {
	return useQuery({
		queryKey: ['account-total-value', address],
		queryFn: async () => {
			const result = await fetchAccountTotalValue({
				data: { address },
			})
			return Number(result.totalValue)
		},
	})
}

function SectionsWrapper(props: {
	address: Address.Address
	page: number
	limit: number
	goToPage: (page: number) => void
	activeSection: number
	onSectionChange: (index: number) => void
}) {
	const { address, page, limit, goToPage, activeSection, onSectionChange } =
		props

	const state = useRouterState()
	const { pageData: initialData } =
		Route.useLoaderData() as AccountRouteLoaderData

	const { data, isLoading } = useQuery({
		...transactionsQueryOptions({
			address,
			page,
			limit,
			offset: (page - 1) * limit,
		}),
		initialData,
	})
	const { transactions, total, knownEvents } = data ?? {
		transactions: [],
		total: 0,
		knownEvents: {},
	}

	const isLoadingPage =
		(state.isLoading &&
			state.location.pathname.includes('/account/') &&
			!state.location.pathname.includes('api/')) ||
		isLoading

	const isMobile = useMediaQuery('(max-width: 1239px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	if (transactions.length === 0 && isLoadingPage)
		return <SectionsSkeleton totalItems={total} />
	return (
		<Sections
			mode={mode}
			sections={[
				{
					title: 'History',
					columns: {
						stacked: [
							{ label: 'Time', align: 'start', minWidth: 100 },
							{ label: 'Hash', align: 'start' },
							{ label: 'Total', align: 'end' },
						],
						tabs: [
							{ label: 'Time', align: 'start', minWidth: 100 },
							{ label: 'Description', align: 'start' },
							{ label: 'Hash', align: 'end' },
							{ label: 'Fee', align: 'end' },
							{ label: 'Total', align: 'end' },
						],
					},
					items: (mode) => {
						if (mode === 'stacked')
							return transactions.map((transaction) => {
								const receipt = transaction.receipt
								return [
									<TransactionTimestamp
										key="time"
										timestamp={transaction.block.timestamp}
									/>,
									<TransactionHashLink key="hash" hash={transaction.hash} />,
									<TransactionRowTotal
										key="total"
										transaction={transaction}
										knownEvents={knownEvents[transaction.hash] ?? []}
										receipt={receipt}
									/>,
								]
							})

						return transactions.map((transaction) => {
							const receipt = transaction.receipt
							return [
								<TransactionTimestamp
									key="time"
									timestamp={transaction.block.timestamp}
								/>,
								<TransactionRowDescription
									key="desc"
									transaction={transaction}
									knownEvents={knownEvents[transaction.hash] ?? []}
									receipt={receipt}
									accountAddress={address}
								/>,
								<TransactionHashLink key="hash" hash={transaction.hash} />,
								<TransactionFee key="fee" receipt={receipt} />,
								<TransactionRowTotal
									key="total"
									transaction={transaction}
									knownEvents={knownEvents[transaction.hash] ?? []}
									receipt={receipt}
								/>,
							]
						})
					},
					totalItems: total,
					page,
					isPending: isLoadingPage,
					onPageChange: goToPage,
					itemsLabel: 'transactions',
					itemsPerPage: limit,
				},
				{
					title: 'Assets',
					columns: {
						stacked: [
							{ label: 'Name', align: 'start' },
							{ label: 'Contract', align: 'start' },
							{ label: 'Amount', align: 'end' },
						],
						tabs: [
							{ label: 'Name', align: 'start' },
							{ label: 'Ticker', align: 'start' },
							{ label: 'Currency', align: 'start' },
							{ label: 'Amount', align: 'end' },
							{ label: 'Value', align: 'end' },
						],
					},
					items: (mode) =>
						assets.map((assetAddress) => {
							if (mode === 'stacked')
								return [
									<TokenName key="name" contractAddress={assetAddress} />,
									<AssetContract
										key="contract"
										contractAddress={assetAddress}
									/>,
									<AssetAmount
										key="amount"
										contractAddress={assetAddress}
										accountAddress={address}
									/>,
								]

							return [
								<TokenName key="name" contractAddress={assetAddress} />,
								<TokenSymbol key="symbol" contractAddress={assetAddress} />,
								<span key="currency">USD</span>,
								<AssetAmount
									key="amount"
									contractAddress={assetAddress}
									accountAddress={address}
								/>,
								<AssetValue
									key="value"
									contractAddress={assetAddress}
									accountAddress={address}
								/>,
							]
						}),
					totalItems: assets.length,
					page: 1, // TODO
					isPending: false,
					onPageChange: () => {},
					itemsLabel: 'assets',
					itemsPerPage: assets.length,
				},
			]}
			activeSection={activeSection}
			onSectionChange={onSectionChange}
		/>
	)
}

function TransactionRowDescription(props: {
	transaction: Transaction
	knownEvents: KnownEvent[]
	receipt?: TransactionReceipt
	accountAddress: Address.Address
}) {
	const { transaction, knownEvents, receipt, accountAddress } = props

	return (
		<TransactionDescription
			transaction={transaction}
			knownEvents={knownEvents}
			transactionReceipt={receipt}
			accountAddress={accountAddress}
		/>
	)
}

function TransactionRowTotal(props: {
	transaction: Transaction
	knownEvents: KnownEvent[]
	receipt?: TransactionReceipt
}) {
	const { transaction, knownEvents } = props

	return (
		<TransactionTotal transaction={transaction} knownEvents={knownEvents} />
	)
}

function TokenName(props: { contractAddress: Address.Address }) {
	const { contractAddress } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	return (
		<Link
			to="/token/$address"
			params={{ address: contractAddress }}
			className="hover:text-accent transition-colors"
		>
			{metadata?.name || 'Unknown Token'}
		</Link>
	)
}

function TokenSymbol(props: { contractAddress: Address.Address }) {
	const { contractAddress } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	return (
		<Link
			to="/token/$address"
			params={{ address: contractAddress }}
			className="text-accent hover:text-accent/80 transition-colors"
		>
			{metadata?.symbol || 'TOKEN'}
		</Link>
	)
}

function AssetContract(props: { contractAddress: Address.Address }) {
	const { contractAddress } = props

	return (
		<Link
			to="/token/$address"
			params={{ address: contractAddress }}
			className="text-accent hover:text-accent/80 transition-colors text-[13px]"
		>
			{HexFormatter.truncate(contractAddress, 10)}
		</Link>
	)
}

function AssetAmount(props: {
	contractAddress: Address.Address
	accountAddress: Address.Address
}) {
	const { contractAddress, accountAddress } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	const { data: balance } = Hooks.token.useGetBalance({
		token: contractAddress,
		account: accountAddress,
		query: {
			enabled: Boolean(accountAddress && contractAddress),
		},
	})

	return (
		<span className="text-[12px]">
			{metadata?.decimals !== undefined &&
				PriceFormatter.formatAmount(
					formatUnits(balance ?? 0n, metadata.decimals),
				)}
		</span>
	)
}

function AssetValue(props: {
	contractAddress: Address.Address
	accountAddress: Address.Address
}) {
	const { contractAddress, accountAddress } = props

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	const { data: balance } = Hooks.token.useGetBalance({
		token: contractAddress,
		account: accountAddress,
		query: {
			enabled: Boolean(accountAddress && contractAddress),
		},
	})

	return (
		<span className="text-[12px]">
			{metadata?.decimals !== undefined &&
				PriceFormatter.format(balance ?? 0n, {
					decimals: metadata.decimals,
					format: 'short',
				})}
		</span>
	)
}

function TransactionFee(props: { receipt: TransactionReceipt }) {
	const { receipt } = props

	if (!receipt) return <span className="text-tertiary">…</span>

	const fee = Number(
		Value.format(receipt.effectiveGasPrice * receipt.gasUsed, 18),
	)

	return <span className="text-tertiary">{PriceFormatter.format(fee)}</span>
}

function TransactionDescription(props: {
	transaction: Transaction
	knownEvents: Array<KnownEvent>
	transactionReceipt: TransactionReceipt | undefined
	accountAddress: Address.Address
}) {
	const { knownEvents, accountAddress } = props

	const [expanded, setExpanded] = React.useState(false)

	if (!knownEvents || knownEvents.length === 0)
		return (
			<div className="text-tertiary h-5 flex items-center whitespace-nowrap">
				<span className="inline-block">…</span>
			</div>
		)

	const eventsToShow = expanded ? knownEvents : [knownEvents[0]]
	const remainingCount = knownEvents.length - eventsToShow.length
	const perspectiveEvents = eventsToShow.map((event) =>
		getPerspectiveEvent(event, accountAddress),
	)

	return (
		<div className="text-primary h-5 flex items-center whitespace-nowrap">
			{perspectiveEvents.map((event, index) => (
				<div
					key={`${event.type}-${index}`}
					className="inline-flex items-center"
				>
					<EventDescription
						event={event}
						seenAs={accountAddress}
						className="flex flex-row items-center gap-[6px] leading-[18px] w-auto justify-center flex-nowrap"
					/>
					{index === 0 && remainingCount > 0 && (
						<button
							type="button"
							onClick={() => setExpanded(true)}
							className="ml-1 text-base-content-secondary cursor-pointer press-down shrink-0"
						>
							and {remainingCount} more
						</button>
					)}
					{event.note && (
						<span className="text-tertiary truncate">
							{' '}
							(note: {event.note})
						</span>
					)}
				</div>
			))}
			{/* {event.note && (
				<span className="text-tertiary"> (note: {event.note})</span>
			)} */}
		</div>
	)
}

function getPerspectiveEvent(
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
		if (part.type === 'secondary' && part.value.toLowerCase() === 'to')
			return { ...part, value: 'from' }
		if (part.type === 'account' && sender) return { ...part, value: sender }
		return part
	})
	return { ...event, parts: updatedParts }
}

function TransactionHashLink(props: { hash: Hex.Hex | null | undefined }) {
	const { hash } = props

	if (!hash) return null
	return (
		<Link
			to={'/tx/$hash'}
			params={{ hash }}
			className="text-[13px] text-tertiary press-down inline-flex items-center gap-1"
			title={hash}
		>
			{HexFormatter.truncate(hash, 6)}
		</Link>
	)
}

function TransactionTimestamp(props: { timestamp: bigint }) {
	const { timestamp } = props

	return (
		<div className="text-nowrap">
			<RelativeTime timestamp={timestamp} className="text-tertiary" />
		</div>
	)
}

function TransactionTotal(props: {
	transaction: Transaction
	knownEvents: KnownEvent[]
}) {
	const { transaction, knownEvents } = props

	const amountParts = React.useMemo(
		() =>
			knownEvents.flatMap((event) =>
				event.parts.filter(
					(part): part is Extract<KnownEventPart, { type: 'amount' }> =>
						part.type === 'amount',
				),
			),
		[knownEvents],
	)

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
