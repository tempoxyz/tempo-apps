import {
	keepPreviousData,
	queryOptions,
	useSuspenseQuery,
} from '@tanstack/react-query'
import {
	ClientOnly,
	createFileRoute,
	Link,
	useNavigate,
	useParams,
	useRouterState,
} from '@tanstack/react-router'
import { Address, Hex } from 'ox'
import * as React from 'react'
import { Hooks } from 'tempo.ts/wagmi'
import type { RpcTransaction as Transaction } from 'viem'
import { formatEther, formatUnits } from 'viem'
import { useBlock, useClient, useTransactionReceipt } from 'wagmi'
import { getClient } from 'wagmi/actions'
import * as z from 'zod/mini'
import { EventDescription } from '#components/EventDescription'
import { RelativeTime } from '#components/RelativeTime'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import { parseKnownEvents } from '#lib/known-events'
import { config } from '#wagmi.config'
import ArrowRight from '~icons/lucide/arrow-right'

type TransactionsResponse = {
	transactions: Array<Transaction>
	total: number
	offset: number // Next offset to use for pagination
	limit: number
	hasMore: boolean
}

const rowsPerPage = 10

const transactionsQuery = (
	address: Address.Address,
	page: number,
	limit: number,
	chainId: number,
	offset: number,
) =>
	queryOptions({
		queryKey: ['account-transactions', chainId, address, page],
		queryFn: (): Promise<TransactionsResponse> =>
			fetch(`/api/address/${address}?offset=${offset}&limit=${limit}`).then(
				(response) => response.json(),
			),
		// auto-refresh page 1 since new transactions appear there
		refetchInterval: page === 1 ? 4_000 : false,
		refetchIntervalInBackground: page === 1,
		refetchOnWindowFocus: page === 1,
		staleTime: page === 1 ? 0 : 60_000, // page 1: always fresh, others: 60s cache
		placeholderData: keepPreviousData,
	})

export const Route = createFileRoute('/_layout/account/$address')({
	component: RouteComponent,
	validateSearch: z.object({
		page: z._default(z.number(), 1),
		tab: z._default(z.enum(['history', 'assets']), 'history'),
	}),
	loaderDeps: ({ search: { page } }) => ({ page }),
	loader: async ({ deps: { page }, params: { address }, context }) => {
		const offset = (page - 1) * rowsPerPage

		const client = getClient(config)

		await context.queryClient.fetchQuery(
			transactionsQuery(address, page, rowsPerPage, client.chain.id, offset),
		)
	},
	params: {
		parse: z.object({
			address: z.pipe(
				z.string(),
				z.transform((x) => {
					Address.assert(x)
					return x
				}),
			),
		}).parse,
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
	const routerState = useRouterState()
	const { address } = Route.useParams()
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

	const inputRef = React.useRef<HTMLInputElement | null>(null)

	React.useEffect(() => {
		const listener = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault()
				inputRef.current?.focus()
			}
		}
		window.addEventListener('keydown', listener)
		return () => window.removeEventListener('keydown', listener)
	}, [])

	const handleSearch: React.FormEventHandler<HTMLFormElement> =
		React.useCallback(
			(event) => {
				event.preventDefault()
				const formData = new FormData(event.currentTarget)
				const value = formData.get('value')?.toString().trim()

				if (!value) return
				try {
					Hex.assert(value)
					navigate({
						to: '/$value',
						params: { value },
					})
				} catch (error) {
					console.error('Invalid search value provided', error)
				}
			},
			[navigate],
		)

	return (
		<div className="px-4">
			<div className="mx-auto flex max-w-5xl flex-col gap-8">
				<section className="flex flex-col gap-4">
					<div className="flex flex-col items-center gap-2 text-center">
						<form onSubmit={handleSearch} className="w-full max-w-xl ">
							<div className="relative">
								<input
									ref={inputRef}
									name="value"
									type="text"
									placeholder="Enter address, token, or transaction…"
									spellCheck={false}
									autoCapitalize="off"
									autoComplete="off"
									autoCorrect="off"
									className="w-full rounded-lg border border-border-primary bg-surface px-4 py-2.5 pr-12 text-sm text-primary transition focus:outline-none focus:ring-0 shadow-[0px_4px_54px_0px_rgba(0,0,0,0.06)] outline-1 -outline-offset-1 outline-black-white/10"
									data-1p-ignore
								/>
								<button
									type="submit"
									disabled={routerState.isLoading}
									className="my-auto bg-black-white/10 size-6 rounded-full absolute inset-y-0 right-2.5 flex items-center justify-center text-tertiary transition-colors hover:text-secondary disabled:opacity-50"
									aria-label="Search"
								>
									<ArrowRight className="size-4" aria-hidden />
								</button>
							</div>
						</form>
						<p className="text-xs text-tertiary font-mono">
							<span className="font-mono text-[11px]">⌘</span> or{' '}
							<span className="font-mono text-[11px]">Ctrl</span> +{' '}
							<span className="font-mono text-[11px]">k</span> to focus
						</p>
					</div>
				</section>

				<div className="grid grid-cols-1 gap-6 font-mono">
					<section className="flex flex-col gap-6 w-full">
						{/* Tabs */}
						<div className="rounded-xl border border-border-primary bg-primary">
							<div className="h-10 flex items-center">
								<Link
									to="."
									search={{ page, tab: 'history' }}
									onClick={(e) => {
										e.preventDefault()
										setActiveTab('history')
									}}
									className={`h-full pl-[20px] pr-[8px] flex items-center text-sm font-medium uppercase tracking-[0.15em] transition-colors focus-visible:-outline-offset-[2px]! active:translate-y-[0.5px] ${
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
									className={`h-full px-[8px] flex items-center text-sm font-medium uppercase tracking-[0.15em] transition-colors focus-visible:-outline-offset-[2px]! active:translate-y-[0.5px] ${
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
									<table className="w-full border-collapse text-sm rounded-t-sm">
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
		</div>
	)
}

function HistoryTabSkeleton() {
	return (
		<>
			<div className="overflow-x-auto pt-3 bg-surface rounded-t-lg relative">
				<table className="border-collapse text-sm rounded-t-sm min-w-full table-fixed">
					<colgroup>
						<col className="w-28" />
						<col />
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
						{Array.from({ length: rowsPerPage }, (_, i) => `skeleton-${i}`).map(
							(key) => (
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
							),
						)}
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
	goToPage: (page: number) => void
	isPending: boolean
}) {
	const { address, page, goToPage, isPending } = props

	const client = useClient()
	if (!client) throw new Error('client not found')

	const offset = (page - 1) * rowsPerPage

	const { data } = useSuspenseQuery(
		transactionsQuery(address, page, rowsPerPage, client.chain.id, offset),
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
				<table className="border-collapse text-sm rounded-t-sm min-w-full table-fixed">
					<colgroup>
						<col className="w-28" />
						<col />
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
						{Array.from({ length: rowsPerPage }, (_, index) => {
							const transaction = transactions?.[index]
							const key = transaction?.hash ?? `empty-row-${index}`

							if (!transaction) {
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
							}

							return (
								<TransactionRow
									key={key}
									transaction={transaction}
									address={address}
								/>
							)
						})}
					</tbody>
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

							const pages: (number | 'ellipsis')[] = []

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
						<ClientOnly fallback={<React.Fragment>¬</React.Fragment>}>
							{totalTransactions === 1 ? 'transaction' : 'transactions'}
						</ClientOnly>
					</span>
				</div>
			</div>
		</>
	)
}

function TransactionRow(props: {
	transaction: Transaction
	address: Address.Address
}) {
	const { transaction, address } = props

	return (
		<tr key={transaction.hash} className="transition-colors hover:bg-alt h-12">
			<td className="px-5 py-3 text-primary text-xs align-middle whitespace-nowrap overflow-hidden h-12">
				<div className="h-5 flex items-center overflow-hidden">
					<TransactionTimestamp blockNumber={transaction.blockNumber} />
				</div>
			</td>

			<td className="px-4 py-3 text-primary text-sm align-middle text-left whitespace-nowrap overflow-hidden h-12">
				<div className="h-5 flex items-center overflow-hidden">
					<TransactionDescription transaction={transaction} address={address} />
				</div>
			</td>

			<td className="px-3 py-3 font-mono text-[11px] text-tertiary align-middle text-right whitespace-nowrap overflow-hidden h-12">
				<div className="h-5 flex items-center justify-end overflow-hidden">
					<Link
						to={'/receipt/$hash'}
						params={{ hash: transaction.hash ?? '' }}
						className="hover:text-accent transition-colors"
					>
						{HexFormatter.truncate(transaction.hash, 6)}
					</Link>
				</div>
			</td>

			<td className="px-3 py-3 text-tertiary align-middle text-right whitespace-nowrap overflow-hidden h-12">
				<div className="h-5 flex items-center justify-end overflow-hidden">
					<TransactionFee transaction={transaction} />
				</div>
			</td>

			<td className="px-5 py-3 text-right font-mono text-xs align-middle whitespace-nowrap overflow-hidden h-12">
				<div className="h-5 flex items-center justify-end overflow-hidden">
					<TransactionTotal transaction={transaction} />
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

	if (!receipt) {
		return <span className="text-tertiary">···</span>
	}

	const fee = PriceFormatter.format(
		receipt.gasUsed * receipt.effectiveGasPrice, // TODO: double check
		18,
	)

	return <span className="text-tertiary">{fee}</span>
}

function TransactionTotal(props: { transaction: Transaction }) {
	const { transaction } = props

	const { data: receipt } = useTransactionReceipt({
		hash: transaction.hash,
		query: {
			enabled: Boolean(transaction.hash),
		},
	})

	const knownEvents = React.useMemo(() => {
		if (!receipt) return []
		return parseKnownEvents(receipt)
	}, [receipt])

	const [event] = knownEvents

	// Find the first amount in the event parts
	const amount = event?.parts.find((part) => part.type === 'amount')

	if (!amount || amount.type !== 'amount') {
		// Fallback to native currency value
		const value = transaction.value ? Hex.toBigInt(transaction.value) : 0n
		if (value === 0n) {
			return <span className="text-tertiary">—</span>
		}
		const ethAmount = parseFloat(formatEther(value))
		const dollarAmount = ethAmount * 2_000
		return <span className="text-primary">${dollarAmount.toFixed(2)}</span>
	}

	// Calculate dollar value from token amount
	const decimals = amount.value.decimals ?? 6
	const tokenAmount = parseFloat(formatUnits(amount.value.value, decimals))
	// TODO: Get actual token price instead of assuming $1
	const dollarAmount = tokenAmount * 1

	if (dollarAmount > 0.01) {
		return <span className="text-primary">${dollarAmount.toFixed(2)}</span>
	}

	return <span className="text-tertiary">${dollarAmount.toFixed(2)}</span>
}

function AssetRow(props: { contractAddress: Address.Address }) {
	const { contractAddress } = props

	const { address } = useParams({ from: Route.id })
	const { data: metadata } = Hooks.token.useGetMetadata({
		token: contractAddress,
	})

	const { data: balance } = Hooks.token.useGetBalance({
		token: contractAddress,
		account: address,
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
				{`${PriceFormatter.format(Number(balance ?? 0n), metadata?.decimals ?? 6)}`}
			</td>
		</tr>
	)
}

function TransactionDescription(props: {
	transaction: Transaction
	address: Address.Address
}) {
	const { transaction, address } = props
	const [expanded, setExpanded] = React.useState(false)

	const { data: receipt } = useTransactionReceipt({
		hash: transaction.hash,
		query: {
			enabled: Boolean(transaction.hash),
		},
	})

	const knownEvents = React.useMemo(() => {
		if (!receipt) return []
		return parseKnownEvents(receipt)
	}, [receipt])

	if (!knownEvents || knownEvents.length === 0) return null

	const eventsToShow = expanded ? knownEvents : [knownEvents[0]]
	const remainingCount = knownEvents.length - eventsToShow.length

	return (
		<div className="text-primary flex flex-col gap-2">
			{eventsToShow.map((event, eventIndex) => {
				const key = `${event.type}-${eventIndex}`
				return (
					<div
						key={key}
						className="flex flex-row flex-wrap items-center gap-[4px]"
					>
						<EventDescription event={event} seenAs={address} />
						{eventIndex === 0 && remainingCount > 0 && (
							<button
								type="button"
								onClick={() => setExpanded(true)}
								className="text-base-content-secondary cursor-pointer active:translate-y-[0.5px]"
							>
								and {remainingCount} more
							</button>
						)}
						{event.note && (
							<span className="text-tertiary w-full">
								{' '}
								(note: {event.note})
							</span>
						)}
					</div>
				)
			})}
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

	if (!timestamp) return <span className="text-tertiary">···</span>

	return <RelativeTime timestamp={timestamp} className="text-tertiary" />
}
