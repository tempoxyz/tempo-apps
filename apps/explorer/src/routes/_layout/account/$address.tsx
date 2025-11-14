import {
	keepPreviousData,
	queryOptions,
	useQuery,
	useSuspenseQuery,
} from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from '@tanstack/react-router'
import { Address, Hex } from 'ox'
import * as React from 'react'
import { Hooks } from 'tempo.ts/wagmi'
import type { RpcTransaction as Transaction, TransactionReceipt } from 'viem'
import { formatUnits } from 'viem'
import { useBlock, useChainId, useTransactionReceipt } from 'wagmi'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { AccountCard } from '#components/Account.tsx'
import { EventDescription } from '#components/EventDescription.tsx'
import { NotFound } from '#components/NotFound.tsx'
import { RelativeTime } from '#components/RelativeTime'
import { Sections } from '#components/Sections.tsx'
import { HexFormatter, PriceFormatter } from '#lib/formatting.ts'
import { useMediaQuery } from '#lib/hooks'
import { type KnownEvent, parseKnownEvents } from '#lib/known-events.ts'
import { config } from '#wagmi.config.ts'

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
	chainId: number
	offset: number
	_key?: string | undefined
}

function transactionsQueryOptions(params: TransactionQuery) {
	return queryOptions({
		queryKey: [
			'account-transactions',
			params.chainId,
			params.address,
			params.page,
			params._key,
		],
		queryFn: async (): Promise<TransactionsResponse> => {
			const searchParams = new URLSearchParams({
				limit: params.limit.toString(),
				offset: params.offset.toString(),
			})
			const url = `/api/account/${params.address}?${searchParams.toString()}`
			const response = await fetch(url)
			return await response.json()
		},
		// auto-refresh page 1 since new transactions appear there
		refetchInterval: params.page === 1 ? 4_000 : false,
		refetchIntervalInBackground: params.page === 1,
		refetchOnWindowFocus: params.page === 1,
		staleTime: params.page === 1 ? 0 : 60_000, // page 1: always fresh, others: 60s cache
		placeholderData: keepPreviousData,
	})
}

export const Route = createFileRoute('/_layout/account/$address')({
	component: RouteComponent,
	notFoundComponent: NotFound,
	validateSearch: z.object({
		page: z.prefault(z.number(), 1),
		limit: z.prefault(z.number(), rowsPerPage),
		tab: z.prefault(z.enum(['history', 'assets']), 'history'),
	}),
	loaderDeps: ({ search: { page } }) => ({ page }),
	loader: async ({ deps: { page }, params, context }) => {
		const { address } = params
		if (!Address.validate(address)) throw notFound()

		const offset = (page - 1) * rowsPerPage
		const chainId = getChainId(config)

		await context.queryClient.fetchQuery(
			transactionsQueryOptions({
				address,
				page,
				offset,
				limit: rowsPerPage,
				chainId,
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
	const chainId = useChainId()

	// fetch the most recent transactions (pg.1)
	const { data: recentData } = useQuery(
		transactionsQueryOptions({
			address,
			page: 1,
			limit: 1,
			chainId,
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
			chainId,
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

	const { address } = Route.useParams()
	Address.assert(address)

	const { page, tab } = Route.useSearch()

	const activeTab = tab
	const [isPending, startTransition] = React.useTransition()

	const goToPage = React.useCallback(
		(newPage: number) => {
			startTransition(() => {
				navigate({ to: '.', search: { page: newPage, tab } })
			})
		},
		[navigate, tab],
	)

	const setActiveSection = React.useCallback(
		(newIndex: number) => {
			const newTab = newIndex === 0 ? 'history' : 'assets'
			navigate({ to: '.', search: { page, tab: newTab } })
		},
		[navigate, page],
	)

	return (
		<div className="flex flex-col min-[1240px]:grid max-w-[1080px] w-full min-[1240px]:pt-20 pt-10 min-[1240px]:pb-16 pb-8 px-4 gap-[14px] min-w-0 min-[1240px]:grid-cols-[auto_1fr]">
			<AccountCardWithTimestamps address={address} />
			<SectionsWrapper
				address={address}
				page={page}
				isPending={isPending}
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
	isPending: boolean
	goToPage: (page: number) => void
	activeSection: number
	onSectionChange: (index: number) => void
}) {
	const { address, page, isPending, goToPage, activeSection, onSectionChange } =
		props

	const chainId = useChainId()
	const offset = (page - 1) * rowsPerPage

	const { data } = useSuspenseQuery(
		transactionsQueryOptions({
			page,
			offset,
			address,
			chainId,
			limit: rowsPerPage,
		}),
	)

	const transactions = data.transactions
	const totalTransactions = data.total

	const isMobile = useMediaQuery('(max-width: 1239px)')
	const mode = isMobile ? 'stacked' : 'tabs'

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
							return transactions.map((transaction) => [
								<TransactionTimestamp
									key="time"
									blockNumber={transaction.blockNumber}
								/>,
								<Link
									key="hash"
									to={'/tx/$hash'}
									params={{ hash: transaction.hash ?? '' }}
									className="text-[13px] text-tertiary press-down inline-flex"
								>
									{HexFormatter.truncate(transaction.hash, 6)}
								</Link>,
								<TransactionRowTotal key="total" transaction={transaction} />,
							])

						return transactions.map((transaction) => [
							<TransactionTimestamp
								key="time"
								blockNumber={transaction.blockNumber}
							/>,
							<TransactionRowDescription
								key="desc"
								transaction={transaction}
							/>,
							<Link
								key="hash"
								to={'/tx/$hash'}
								params={{ hash: transaction.hash ?? '' }}
								className="text-[13px] text-tertiary press-down inline-flex"
							>
								{HexFormatter.truncate(transaction.hash, 6)}
							</Link>,
							<TransactionFee key="fee" transaction={transaction} />,
							<TransactionRowTotal key="total" transaction={transaction} />,
						])
					},
					totalItems: totalTransactions,
					page,
					isPending,
					onPageChange: goToPage,
					itemsLabel: 'transactions',
					itemsPerPage: rowsPerPage,
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

function TransactionRowDescription(props: { transaction: Transaction }) {
	const { transaction } = props

	const { data: transactionReceipt } = useTransactionReceipt({
		hash: transaction.hash,
		query: {
			enabled: Boolean(transaction.hash),
		},
	})

	const knownEvents = React.useMemo(() => {
		if (!transactionReceipt) return []
		return parseKnownEvents(transactionReceipt)
	}, [transactionReceipt])

	return (
		<TransactionDescription
			transaction={transaction}
			knownEvents={knownEvents}
			transactionReceipt={transactionReceipt}
		/>
	)
}

function TransactionRowTotal(props: { transaction: Transaction }) {
	const { transaction } = props

	const { data: transactionReceipt } = useTransactionReceipt({
		hash: transaction.hash,
		query: {
			enabled: Boolean(transaction.hash),
		},
	})

	const knownEvents = React.useMemo(() => {
		if (!transactionReceipt) return []
		return parseKnownEvents(transactionReceipt)
	}, [transactionReceipt])

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

function TransactionFee(props: { transaction: Transaction }) {
	const { transaction } = props

	const { data: receipt } = useTransactionReceipt({
		hash: transaction.hash,
		query: {
			enabled: Boolean(transaction.hash),
		},
	})

	if (!receipt) return <span className="text-tertiary">…</span>

	const fee = PriceFormatter.format(
		receipt.gasUsed * receipt.effectiveGasPrice, // TODO: double check
		18,
	)

	return <span className="text-tertiary">{fee}</span>
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

function TransactionTimestamp(props: {
	blockNumber: Hex.Hex | null | undefined
}) {
	const { blockNumber } = props

	const { data: timestamp } = useBlock({
		blockNumber: blockNumber ? Hex.toBigInt(blockNumber) : undefined,
		query: {
			enabled: Boolean(blockNumber),
			select: (block) => block.timestamp,
		},
	})

	if (!timestamp) return <span className="text-tertiary">…</span>

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
	const {
		transaction,
		knownEvents: [event],
	} = props

	const amount = event?.parts.find((part) => part.type === 'amount')

	if (!amount || amount.type !== 'amount') {
		const value = transaction.value ? Hex.toBigInt(transaction.value) : 0n
		if (value === 0n) return <span className="text-tertiary">—</span>
		return (
			<span className="text-primary">
				{PriceFormatter.format(value, { decimals: 18, format: 'short' })}
			</span>
		)
	}

	return (
		<span
			className={amount.value.value > 0n ? 'text-primary' : 'text-tertiary'}
		>
			{PriceFormatter.format(amount.value.value, {
				decimals: amount.value.decimals ?? 6, // TODO: check decimals
				format: 'short',
			})}
		</span>
	)
}
