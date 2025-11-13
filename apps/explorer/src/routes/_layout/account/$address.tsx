import {
	keepPreviousData,
	queryOptions,
	useQuery,
	useSuspenseQuery,
} from '@tanstack/react-query'
import {
	ClientOnly,
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useParams,
} from '@tanstack/react-router'
import { Address, Hex } from 'ox'
import * as React from 'react'
import { Hooks } from 'tempo.ts/wagmi'
import type { RpcTransaction as Transaction, TransactionReceipt } from 'viem'
import { formatEther, formatUnits } from 'viem'
import { useBlock, useChainId, useTransactionReceipt } from 'wagmi'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { AccountCard } from '#components/Account.tsx'
import { EventDescription } from '#components/EventDescription.tsx'
import { NotFound } from '#components/NotFound.tsx'
import { RelativeTime } from '#components/RelativeTime'
import { HexFormatter, PriceFormatter } from '#lib/formatting.ts'
import { type KnownEvent, parseKnownEvents } from '#lib/known-events.ts'
import { config } from '#wagmi.config.ts'

type TransactionsResponse = {
	transactions: Array<Transaction>
	total: number
	offset: number // Next offset to use for pagination
	limit: number
	hasMore: boolean
}

const rowsPerPage = 7

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
		limit: z.prefault(z.number(), 7),
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
	const recentTransaction = recentData?.transactions.at(0)
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
			className="self-start w-full sm:max-w-[350px]"
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

	const setActiveTab = React.useCallback(
		(newTab: 'history' | 'assets') => {
			navigate({ to: '.', search: { page, tab: newTab } })
		},
		[navigate, page],
	)

	return (
		<main className="max-h-dvh overflow-y-auto overflow-x-auto">
			<div className="mx-auto flex max-w-7xl flex-col pt-20 pb-16 px-4 min-w-0">
				<div className="flex gap-4 font-mono flex-col min-[1200px]:flex-row min-w-0">
					<React.Suspense
						fallback={
							<AccountCard
								address={address}
								className="self-start w-full min-[1200px]:min-w-[350px] min-[1200px]:w-auto"
							/>
						}
					>
						<AccountCardWithTimestamps address={address} />
					</React.Suspense>
					<section className="flex flex-col grow basis-0 gap-4 border border-primary/10 rounded-xl min-w-0">
						{/* Tabs */}
						<div className="overflow-hidden rounded-xl border border-border-primary/10 bg-primary">
							<div className="h-10 flex items-center gap-6">
								<Link
									to="."
									search={{ page, tab: 'history' }}
									onClick={(e) => {
										e.preventDefault()
										setActiveTab('history')
									}}
									className={`h-full pl-[20px] pr-[8px] flex items-center text-sm font-medium uppercase tracking-[0.15em] transition-colors focus-visible:-outline-offset-2! active:translate-y-[.5px] ${
										activeTab === 'history'
											? 'text-primary'
											: 'text-tertiary hover:text-secondary'
									}`}
								>
									HISTORY
								</Link>
								<Link
									to="."
									search={{ page, tab: 'assets' }}
									onClick={(e) => {
										e.preventDefault()
										setActiveTab('assets')
									}}
									className={`h-full px-[8px] flex items-center text-sm font-medium uppercase tracking-[0.15em] transition-colors focus-visible:-outline-offset-2! active:translate-y-[.5px] ${
										activeTab === 'assets'
											? 'text-primary'
											: 'text-tertiary hover:text-secondary'
									}`}
								>
									ASSETS
								</Link>
							</div>

							{activeTab === 'history' && (
								<React.Suspense fallback={<HistoryTabSkeleton />}>
									<HistoryTabContent
										key={address}
										address={address}
										page={page}
										goToPage={goToPage}
										isPending={isPending}
									/>
								</React.Suspense>
							)}

							{activeTab === 'assets' && (
								<div className="overflow-x-auto pt-3 bg-surface rounded-t-lg">
									<table className="w-full border-collapse text-sm rounded-t-sm table-fixed">
										<thead>
											<tr className="border-dashed border-b border-border-base text-left text-xs tracking-wider text-tertiary">
												<th className="px-5 pb-3 font-normal">Name</th>
												<th className="px-5 pb-3 font-normal">Ticker</th>
												<th className="px-5 pb-3 font-normal">Currency</th>
												<th className="px-5 pb-3 text-right font-normal">
													Amount
												</th>
												<th className="px-5 pb-3 text-right font-normal">
													Value
												</th>
											</tr>
										</thead>
										<ClientOnly fallback={<tbody />}>
											<tbody className="divide-dashed divide-border-base [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border-base">
												{assets.map((assetAddress) => (
													<AssetRow
														key={assetAddress}
														contractAddress={assetAddress}
													/>
												))}
											</tbody>
										</ClientOnly>
									</table>
								</div>
							)}
						</div>
					</section>
				</div>
			</div>
		</main>
	)
}

function HistoryTabSkeleton() {
	return (
		<>
			<div className="overflow-x-auto pt-3 bg-surface rounded-t-lg relative">
				<table className="w-full border-collapse text-sm rounded-t-sm table-auto">
					<colgroup>
						<col className="w-28" />
						<col className="min-w-[200px]" />
						<col className="w-36" />
						<col className="w-24" />
						<col className="w-32" />
					</colgroup>
					<thead>
						<tr className="border-dashed border-b border-border-base text-left text-xs tracking-wider text-tertiary">
							<th className="px-5 pb-3 font-normal text-left whitespace-nowrap">
								Time
							</th>
							<th className="px-5 pb-3 font-normal text-left whitespace-nowrap">
								Description
							</th>
							<th className="px-3 pb-3 font-normal text-right whitespace-nowrap">
								Hash
							</th>
							<th className="px-3 pb-3 font-normal text-right whitespace-nowrap">
								Fee
							</th>
							<th className="px-5 pb-3 font-normal text-right whitespace-nowrap">
								Total
							</th>
						</tr>
					</thead>
					<tbody className="divide-dashed divide-border-base [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border-base">
						{Array.from(
							{ length: rowsPerPage },
							(_, index) => `skeleton-${index}`,
						).map((key) => (
							<tr key={key} className="h-12">
								<td className="h-12">
									<div className="h-5" />
								</td>
								<td className="h-12">
									<div className="h-5" />
								</td>
								<td className="h-12">
									<div className="h-5" />
								</td>
								<td className="h-12">
									<div className="h-5" />
								</td>
								<td className="h-12">
									<div className="h-5" />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="font-mono flex flex-col gap-3 border-t border-dashed border-border-base px-4 py-3 text-xs text-tertiary md:flex-row md:items-center md:justify-between">
				<div className="flex flex-row items-center gap-2">
					<div className="h-7 w-20 bg-alt animate-pulse rounded-lg" />
					<div className="h-7 w-32 bg-alt animate-pulse rounded" />
					<div className="h-7 w-20 bg-alt animate-pulse rounded-lg" />
				</div>
				<div className="h-4 w-48 bg-alt animate-pulse rounded" />
			</div>
		</>
	)
}

function HistoryTabContent(props: {
	address: Address.Address
	page: number
	isPending: boolean
	goToPage: (page: number) => void
}) {
	const { address, page, goToPage, isPending } = props

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
	const totalPages = Math.ceil(totalTransactions / rowsPerPage)

	return (
		<>
			<div className="overflow-x-auto pt-3 bg-surface rounded-t-lg relative">
				<ClientOnly>
					{isPending && (
						<>
							<div className="absolute top-0 left-0 right-0 h-0.5 bg-accent/30 z-10">
								<div className="h-full w-1/4 bg-accent animate-pulse" />
							</div>
							<div className="absolute inset-0 bg-black-white/5 pointer-events-none z-5" />
						</>
					)}
				</ClientOnly>
				<table className="w-full border-collapse text-sm rounded-t-sm table-auto">
					<colgroup>
						<col className="w-28" />
						<col className="min-w-[200px]" />
						<col className="w-36" />
						<col className="w-24" />
						<col className="w-32" />
					</colgroup>
					<thead>
						<tr className="border-dashed border-b border-border-base text-left text-xs tracking-wider text-tertiary">
							<th className="px-5 pb-3 font-normal text-left whitespace-nowrap">
								Time
							</th>
							<th className="px-5 pb-3 font-normal text-left whitespace-nowrap">
								Description
							</th>
							<th className="px-3 pb-3 font-normal text-right whitespace-nowrap">
								Hash
							</th>
							<th className="px-3 pb-3 font-normal text-right whitespace-nowrap">
								Fee
							</th>
							<th className="px-5 pb-3 font-normal text-right whitespace-nowrap">
								Total
							</th>
						</tr>
					</thead>

					<ClientOnly fallback={<tbody />}>
						<tbody className="divide-dashed divide-border-base [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-border-base">
							{Array.from({ length: rowsPerPage }, (_, index) => {
								const transaction = transactions[index]
								const key = transaction?.hash ?? `skeleton-${index}`

								if (transaction)
									return <TransactionRow key={key} transaction={transaction} />

								return (
									<tr key={key} className="h-12">
										<td className="h-12">
											<div className="h-5" />
										</td>
										<td className="h-12">
											<div className="h-5" />
										</td>
										<td className="h-12">
											<div className="h-5" />
										</td>
										<td className="h-12">
											<div className="h-5" />
										</td>
										<td className="h-12">
											<div className="h-5" />
										</td>
									</tr>
								)
							})}
						</tbody>
					</ClientOnly>
				</table>
			</div>

			<div className="font-mono flex flex-col gap-3 border-t border-dashed border-border-base px-4 py-3 text-xs text-tertiary md:flex-row md:items-center md:justify-between">
				<div className="flex flex-row items-center gap-2">
					<button
						type="button"
						onClick={() => goToPage(page - 1)}
						disabled={page <= 1 || isPending}
						className="border border-border-primary px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-alt disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Previous page"
					>
						{isPending ? 'Loading…' : 'Previous'}
					</button>

					<div className="flex items-center gap-1.5">
						{(() => {
							// Show up to 5 consecutive pages centered around current page
							const maxButtons = 5
							let startPage = Math.max(1, page - Math.floor(maxButtons / 2))
							const endPage = Math.min(totalPages, startPage + maxButtons - 1)

							startPage = Math.max(1, endPage - maxButtons + 1)

							const pages: Array<number | 'ellipsis'> = []

							if (startPage > 1) {
								pages.push(1)
								if (startPage > 2) pages.push('ellipsis')
							}

							for (let index = startPage; index <= endPage; index++)
								pages.push(index)

							if (endPage < totalPages) {
								if (endPage < totalPages - 1) pages.push('ellipsis')
								pages.push(totalPages)
							}

							let ellipsisCount = 0
							return pages.map((p) => {
								if (p === 'ellipsis') {
									ellipsisCount++
									return (
										<span
											key={`ellipsis-${ellipsisCount}`}
											className="text-tertiary px-1"
										>
											…
										</span>
									)
								}
								return (
									<button
										key={p}
										type="button"
										onClick={() => goToPage(p)}
										disabled={isPending}
										className={`flex size-7 items-center justify-center transition-colors ${
											page === p
												? 'border border-accent/50 text-primary'
												: 'hover:bg-alt text-primary'
										} ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
									>
										{p}
									</button>
								)
							})
						})()}
					</div>

					<button
						type="button"
						onClick={() => goToPage(page + 1)}
						disabled={page >= totalPages || isPending}
						className="rounded-none border border-border-primary px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-alt disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Next page"
					>
						{isPending ? 'Loading…' : 'Next'}
					</button>
				</div>

				<div className="space-x-2">
					<span className="text-tertiary">Page</span>
					<span className="text-primary">{page}</span>
					<span className="text-tertiary">of</span>
					<span className="text-primary">{totalPages}</span>
					<span className="text-tertiary">•</span>
					<span className="text-primary">{totalTransactions || '…'}</span>
					<span className="text-tertiary">
						<ClientOnly fallback={<React.Fragment>…</React.Fragment>}>
							{totalTransactions === 1 ? 'transaction' : 'transactions'}
						</ClientOnly>
					</span>
				</div>
			</div>
		</>
	)
}

function AssetRow(props: { contractAddress: Address.Address }) {
	const { contractAddress } = props

	const { address } = useParams({ from: Route.id })
	Address.assert(address)

	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
		query: {
			enabled: Boolean(contractAddress),
		},
	})

	const { data: balance } = Hooks.token.useGetBalance({
		token: contractAddress,
		account: address,
		query: {
			enabled: Boolean(address && contractAddress),
		},
	})

	return (
		<tr className="transition-colors hover:bg-alt">
			<td className="px-5 py-3 text-primary">
				<Link
					to="/token/$address"
					params={{ address: contractAddress }}
					className="hover:text-accent transition-colors"
				>
					{metadata?.name || 'Unknown Token'}
				</Link>
			</td>
			<td className="px-5 py-3">
				<Link
					to="/token/$address"
					params={{ address: contractAddress }}
					className="text-accent hover:text-accent/80 transition-colors"
				>
					{metadata?.symbol || 'TOKEN'}
				</Link>
			</td>
			<td className="px-5 py-3 text-primary">USD</td>
			<td className="px-5 py-3 text-right font-mono text-xs text-primary">
				{PriceFormatter.formatAmount(
					formatUnits(balance ?? 0n, metadata?.decimals ?? 6),
				)}
			</td>
			<td className="px-5 py-3 text-right font-mono text-xs text-primary">
				{`${PriceFormatter.format(balance ?? 0n, metadata?.decimals ?? 6)}`}
			</td>
		</tr>
	)
}

function TransactionRow(props: { transaction: Transaction }) {
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
		<tr
			key={transaction.hash}
			className="transition-colors hover:bg-alt min-h-12"
		>
			<td className="px-5 py-3 text-primary text-xs align-middle whitespace-nowrap h-12">
				<div className="h-5 flex items-center">
					<TransactionTimestamp blockNumber={transaction.blockNumber} />
				</div>
			</td>

			<td className="px-4 py-3 text-primary text-sm align-middle text-left h-12">
				<div className="h-5 flex items-center">
					<TransactionDescription
						transaction={transaction}
						knownEvents={knownEvents}
						transactionReceipt={transactionReceipt}
					/>
				</div>
			</td>

			<td className="px-3 py-3 font-mono text-[11px] text-tertiary align-middle text-right whitespace-nowrap h-12">
				<div className="h-5 flex items-center justify-end">
					<Link
						to={'/tx/$hash'}
						params={{ hash: transaction.hash ?? '' }}
						className="hover:text-accent transition-colors"
					>
						{HexFormatter.truncate(transaction.hash, 6)}
					</Link>
				</div>
			</td>

			<td className="px-3 py-3 text-tertiary align-middle text-right whitespace-nowrap h-12">
				<div className="h-5 flex items-center justify-end">
					<TransactionFee transaction={transaction} />
				</div>
			</td>

			<td className="px-5 py-3 text-right font-mono text-xs align-middle whitespace-nowrap h-12">
				<div className="h-5 flex items-center justify-end">
					<TransactionTotal
						transaction={transaction}
						knownEvents={knownEvents}
					/>
				</div>
			</td>
		</tr>
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

	if (!receipt) return <span className="text-tertiary">···</span>

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
							className="ml-1 text-base-content-secondary cursor-pointer active:translate-y-[.5px] shrink-0"
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

	return <RelativeTime timestamp={timestamp} className="text-tertiary" />
}

function TransactionTotal(props: {
	transaction: Transaction
	knownEvents: Array<KnownEvent>
}) {
	const {
		transaction,
		knownEvents: [event],
	} = props

	const amount = event?.parts.find((part) => part.type === 'amount')

	if (!amount || amount.type !== 'amount') {
		const value = transaction.value ? Hex.toBigInt(transaction.value) : 0n
		if (value === 0n) return <span className="text-tertiary">—</span>

		const ethAmount = parseFloat(formatEther(value))
		const dollarAmount = ethAmount * 2_000
		return <span className="text-primary">${dollarAmount.toFixed(2)}</span>
	}

	const decimals = amount.value.decimals ?? 6
	const tokenAmount = parseFloat(formatUnits(amount.value.value, decimals))
	const dollarAmount = tokenAmount * 1

	if (dollarAmount > 0.01)
		return <span className="text-primary">${dollarAmount.toFixed(2)}</span>

	return <span className="text-tertiary">${dollarAmount.toFixed(2)}</span>
}
