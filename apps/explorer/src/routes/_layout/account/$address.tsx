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
import { useBlock } from 'wagmi'
import {
	getBlockQueryOptions,
	getTransactionReceiptQueryOptions,
} from 'wagmi/query'
import * as z from 'zod/mini'
import { AccountCard } from '#components/Account.tsx'
import { EventDescription } from '#components/EventDescription'
import { NotFound } from '#components/NotFound'
import { RelativeTime } from '#components/RelativeTime'
import { Sections } from '#components/Sections'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { useMediaQuery } from '#lib/hooks'
import {
	type KnownEvent,
	type KnownEventPart,
	parseKnownEvents,
} from '#lib/known-events'
import { config } from '#wagmi.config'

type TransactionsResponse = {
	transactions: Array<Transaction>
	total: number
	offset: number // Next offset to use for pagination
	limit: number
	hasMore: boolean
}

const rowsPerPage = 10

type TransactionQuery = {
	address: Address.Address
	page: number
	limit: number
	offset: number
	_key?: string | undefined
}

function transactionsQueryOptions(params: TransactionQuery) {
	return queryOptions({
		queryKey: [
			'account-transactions',
			params.address,
			params.page,
			params.limit,
			params._key,
		],
		queryFn: async ({ client }) => {
			const searchParams = new URLSearchParams({
				limit: params.limit.toString(),
				offset: params.offset.toString(),
			})
			const url = `/api/account/${params.address}?${searchParams.toString()}`
			const data = await fetch(url).then(
				(res) => res.json() as unknown as TransactionsResponse,
			)
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
					return { ...transaction, block, receipt }
				}),
			)
			return { ...data, transactions }
		},
		// auto-refresh page 1 since new transactions appear there
		refetchInterval: params.page === 1 ? 4_000 : false,
		refetchIntervalInBackground: params.page === 1,
		refetchOnWindowFocus: params.page === 1,
		placeholderData: keepPreviousData,
	})
}

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

		return await context.queryClient.fetchQuery(
			transactionsQueryOptions({
				address,
				page,
				limit,
				offset,
			}),
		)
	},
})

const assets = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c0000000000000000000000000000000000001',
	'0x20c0000000000000000000000000000000000002',
	'0x20c0000000000000000000000000000000000003',
] as const

function AccountCardWithTimestamps(props: { address: Address.Address }) {
	const { address } = props

	// fetch the most recent transactions (pg.1)
	const { data: recentData } = useQuery(
		transactionsQueryOptions({
			address,
			page: 1,
			limit: 1,
			offset: 0,
			_key: 'account-creation',
		}),
	)

	// get the 1st (most recent) transaction's block timestamp for "last activity"
	const recentTransaction = recentData?.transactions?.at(0)
	const { data: lastActivityTimestamp } = useBlock({
		blockNumber: Hex.toBigInt(recentTransaction?.blockNumber ?? '0x0'),
		query: {
			enabled: Boolean(recentTransaction?.blockNumber),
			select: (block) => block.timestamp,
		},
	})

	// for "created" timestamp, fetch the earliest transaction, this would be the last page of transactions
	const totalTransactions = recentData?.total ?? 0
	const lastPageOffset = Math.max(0, totalTransactions - 1)

	const { data: oldestData } = useQuery(
		transactionsQueryOptions({
			address,
			page: Math.ceil(totalTransactions / 1),
			limit: 1,
			offset: lastPageOffset,
			_key: 'account-creation',
		}),
	)

	const [oldestTransaction] = oldestData?.transactions ?? []
	const { data: createdTimestamp } = useBlock({
		blockNumber: Hex.toBigInt(oldestTransaction?.blockNumber ?? '0x0'),
		query: {
			enabled: Boolean(oldestTransaction?.blockNumber),
			select: (block) => block.timestamp,
		},
	})

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
			const response = await fetch(`/api/account/${address}/total-value`)
			if (!response.ok)
				throw new Error('Failed to fetch total value', {
					cause: response.statusText,
				})
			const data = await response.text()
			return Number(data)
		},
	})
}

function RouteComponent() {
	const navigate = useNavigate()
	const route = useRouter()
	const { address } = Route.useParams()
	const { page, tab, limit } = Route.useSearch()

	Address.assert(address)

	const activeTab = tab

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
				activeSection={activeTab === 'history' ? 0 : 1}
				onSectionChange={setActiveSection}
			/>
		</div>
	)
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
	const initialData = Route.useLoaderData()

	const { data, isLoading } = useQuery({
		...transactionsQueryOptions({
			address,
			page,
			limit,
			offset: (page - 1) * limit,
		}),
		initialData,
	})
	const { transactions, total } = data ?? { transactions: [], total: 0 }

	const isLoadingPage =
		(state.isLoading && state.location.pathname.includes('/account/')) ||
		isLoading

	const isMobile = useMediaQuery('(max-width: 1239px)')
	const mode = isMobile ? 'stacked' : 'tabs'

	if (transactions.length === 0) return <SectionsSkeleton totalItems={total} />
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
									receipt={receipt}
								/>,
								<TransactionHashLink key="hash" hash={transaction.hash} />,
								<TransactionFee key="fee" receipt={receipt} />,
								<TransactionRowTotal
									key="total"
									transaction={transaction}
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
	receipt?: TransactionReceipt
}) {
	const { transaction, receipt } = props

	const knownEvents = React.useMemo(() => {
		if (!receipt) return []
		return parseKnownEvents(receipt, { transaction })
	}, [receipt, transaction])

	return (
		<TransactionDescription
			transaction={transaction}
			knownEvents={knownEvents}
			transactionReceipt={receipt}
		/>
	)
}

function TransactionRowTotal(props: {
	transaction: Transaction
	receipt?: TransactionReceipt
}) {
	const { transaction, receipt } = props

	const knownEvents = React.useMemo(() => {
		if (!receipt) return []
		return parseKnownEvents(receipt, { transaction })
	}, [receipt, transaction])

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
}) {
	const { knownEvents } = props

	const [expanded, setExpanded] = React.useState(false)

	if (!knownEvents || knownEvents.length === 0)
		return (
			<div className="text-tertiary h-5 flex items-center whitespace-nowrap">
				<span className="inline-block">…</span>
			</div>
		)

	const eventsToShow = expanded ? knownEvents : [knownEvents[0]]
	const remainingCount = knownEvents.length - eventsToShow.length

	const [_event] = knownEvents

	return (
		<div className="text-primary h-5 flex items-center whitespace-nowrap">
			{eventsToShow.map((event, index) => (
				<div
					key={`${event.type}-${index}`}
					className="inline-flex items-center"
				>
					<EventDescription
						event={event}
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

	const amount =
		amountParts.find((part) => part.value.value !== 0n) ?? amountParts.at(0)

	const tokenAddress = amount?.value.token
	const needsMetadata =
		Boolean(tokenAddress) && amount?.value.decimals === undefined
	const { data: metadata } = Hooks.token.useGetMetadata({
		token: (tokenAddress ??
			'0x0000000000000000000000000000000000000000') as Address.Address,
		query: {
			enabled: needsMetadata,
		},
	})

	if (!amount) {
		const value = transaction.value ? Hex.toBigInt(transaction.value) : 0n
		if (value === 0n) return <span className="text-tertiary">—</span>
		return (
			<span className="text-primary">
				{PriceFormatter.format(value, { decimals: 18, format: 'short' })}
			</span>
		)
	}

	const decimals = amount.value.decimals ?? metadata?.decimals
	if (decimals === undefined) return <span className="text-tertiary">…</span>

	return (
		<span
			className={amount.value.value > 0n ? 'text-primary' : 'text-tertiary'}
		>
			{PriceFormatter.format(amount.value.value, {
				decimals,
				format: 'short',
			})}
		</span>
	)
}
