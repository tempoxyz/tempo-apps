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
import { ArrowRight } from 'lucide-react'
import { Address, Hex } from 'ox'
import * as React from 'react'
import { Hooks } from 'tempo.ts/wagmi'
import type { RpcTransaction as Transaction } from 'viem'
import { formatEther, formatUnits } from 'viem'
import { useBlock, useClient, useTransactionReceipt } from 'wagmi'
import { getClient } from 'wagmi/actions'
import * as z from 'zod/mini'

import { PriceFormatter } from '#formatting.ts'
import { type KnownEventPart, parseKnownEvents } from '#known-events.ts'
import { config } from '#wagmi.config.ts'

type TransactionsResponse = {
	transactions: Array<Transaction>
	total: number
	offset: number // Next offset to use for pagination
	limit: number
	hasMore: boolean
}

const transactionsQuery = (
	address: Address.Address,
	page: number,
	limit: number,
	chainId: number,
	offset: number,
) =>
	queryOptions({
		queryKey: ['account-transactions', chainId, address, page, limit],
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
		limit: z._default(z.number(), 7),
		tab: z._default(z.enum(['history', 'assets']), 'history'),
	}),
	loaderDeps: ({ search: { page, limit } }) => ({ page, limit }),
	loader: async ({ deps: { page, limit }, params: { address }, context }) => {
		const offset = (page - 1) * limit

		const client = getClient(config)

		context.queryClient.fetchQuery(
			transactionsQuery(address, page, limit, client.chain.id, offset),
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
	const { page, limit, tab } = Route.useSearch()

	const activeTab = tab

	const goToPage = React.useCallback(
		(newPage: number) => {
			navigate({ to: '.', search: { page: newPage, limit, tab } })
		},
		[navigate, limit, tab],
	)

	const setActiveTab = React.useCallback(
		(newTab: 'history' | 'assets') => {
			navigate({ to: '.', search: { page, limit, tab: newTab } })
		},
		[navigate, page, limit],
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
			<div className="mx-auto flex max-w-6xl flex-col gap-8">
				<section className="flex flex-col gap-4">
					<div className="flex flex-col items-center gap-2 text-center">
						<form onSubmit={handleSearch} className="w-full max-w-xl ">
							<div className="relative ">
								<input
									ref={inputRef}
									name="value"
									type="text"
									placeholder="Enter address, token, or transaction..."
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
						<div className="overflow-hidden rounded-xl border border-border-primary bg-primary">
							<div className="px-5 h-10 flex items-center gap-6">
								<button
									type="button"
									onClick={() => setActiveTab('history')}
									className={`text-sm font-medium uppercase tracking-[0.15em] transition-colors ${
										activeTab === 'history'
											? 'text-primary'
											: 'text-tertiary hover:text-secondary'
									}`}
								>
									HISTORY
								</button>
								<button
									type="button"
									onClick={() => setActiveTab('assets')}
									className={`text-sm font-medium uppercase tracking-[0.15em] transition-colors ${
										activeTab === 'assets'
											? 'text-primary'
											: 'text-tertiary hover:text-secondary'
									}`}
								>
									ASSETS
								</button>
							</div>

							{activeTab === 'history' && (
								<React.Suspense
									fallback={<HistoryLoadingSkeleton limit={limit} />}
								>
									<HistoryTabContent
										key={address}
										address={address}
										page={page}
										limit={limit}
										goToPage={goToPage}
									/>
								</React.Suspense>
							)}

							{activeTab === 'assets' && (
								<div className="overflow-x-auto pt-3 bg-surface rounded-t-lg">
									<table className="w-full border-collapse text-sm rounded-t-sm">
										<thead>
											<tr className="border-dashed border-b-2 border-black-white/10 text-left text-xs tracking-wider text-tertiary">
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
										{/** biome-ignore lint/complexity/noUselessFragments: _ */}
										<ClientOnly fallback={<></>}>
											<tbody className="divide-dashed divide-black-white/10 [&>*:not(:last-child)]:border-b-2 [&>*:not(:last-child)]:border-black-white/10">
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

function HistoryLoadingSkeleton({ limit }: { limit: number }) {
	return (
		<>
			<div className="overflow-x-auto pt-3 bg-surface rounded-t-lg relative">
				<table className="w-full border-collapse text-sm rounded-t-sm table-fixed">
					<colgroup>
						<col className="w-24" />
						<col />
						<col className="w-32" />
						<col className="w-20" />
						<col className="w-28" />
					</colgroup>
					<thead>
						<tr className="border-dashed border-b-2 border-black-white/10 text-left text-xs tracking-wider text-tertiary">
							<th className="px-5 pb-3 font-normal">Time</th>
							<th className="px-5 pb-3 font-normal">Description</th>
							<th className="px-3 pb-3 font-normal">Hash</th>
							<th className="px-3 pb-3 font-normal">Block</th>
							<th className="px-5 pb-3 text-right font-normal">Total</th>
						</tr>
					</thead>
					<tbody
						className="divide-dashed divide-black-white/10 [&>*:not(:last-child)]:border-b-2 [&>*:not(:last-child)]:border-black-white/10"
						style={{ minHeight: `${limit * 56}px` }}
					>
						{Array.from(
							{ length: limit },
							(_, index) => `loading-row-${index}`,
						).map((key) => (
							<tr key={key} className="transition-colors h-14">
								<td className="px-5 py-3">
									<div className="h-4 w-16 bg-alt animate-pulse rounded" />
								</td>
								<td className="px-5 py-3">
									<div className="h-4 w-48 bg-alt animate-pulse rounded" />
								</td>
								<td className="px-3 py-3">
									<div className="h-4 w-24 bg-alt animate-pulse rounded" />
								</td>
								<td className="px-3 py-3">
									<div className="h-4 w-16 bg-alt animate-pulse rounded" />
								</td>
								<td className="px-5 py-3 text-right">
									<div className="h-4 w-20 bg-alt animate-pulse rounded ml-auto" />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="font-mono flex flex-col gap-3 border-t-2 border-dashed border-black-white/10 px-4 py-3 text-xs text-tertiary md:flex-row md:items-center md:justify-between">
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

function HistoryTabContent({
	address,
	page,
	limit,
	goToPage,
}: {
	address: Address.Address
	page: number
	limit: number
	goToPage: (page: number) => void
}) {
	const client = useClient()
	const offset = (page - 1) * limit

	const { data, isFetching } = useSuspenseQuery(
		transactionsQuery(address, page, limit, client?.chain.id ?? 0, offset),
	)

	const transactions = data.transactions
	const totalTransactions = data.total
	const totalPages = Math.ceil(totalTransactions / limit)

	// Track if we're changing pages (not just auto-refreshing)
	const prevPageRef = React.useRef(page)
	const [isChangingPage, setIsChangingPage] = React.useState(false)

	React.useEffect(() => {
		if (prevPageRef.current !== page) {
			setIsChangingPage(true)
			prevPageRef.current = page
		}
	}, [page])

	React.useEffect(() => {
		if (!isFetching && isChangingPage) setIsChangingPage(false)
	}, [isFetching, isChangingPage])

	const showLoading = isChangingPage && isFetching

	return (
		<>
			<div className="overflow-x-auto pt-3 bg-surface rounded-t-lg relative">
				<ClientOnly>
					{showLoading && (
						<>
							<div className="absolute top-0 left-0 right-0 h-0.5 bg-accent/30 z-10">
								<div className="h-full w-1/4 bg-accent animate-pulse" />
							</div>
							<div className="absolute inset-0 bg-black-white/5 pointer-events-none z-5" />
						</>
					)}
				</ClientOnly>
				<table className="w-full border-collapse text-sm rounded-t-sm table-fixed">
					<colgroup>
						<col className="w-24" />
						<col />
						<col className="w-32" />
						<col className="w-20" />
						<col className="w-28" />
					</colgroup>
					<thead>
						<tr className="border-dashed border-b-2 border-black-white/10 text-left text-xs tracking-wider text-tertiary">
							<th className="px-5 pb-3 font-normal">Time</th>
							<th className="px-5 pb-3 font-normal">Description</th>
							<th className="px-3 pb-3 font-normal">Hash</th>
							<th className="px-3 pb-3 font-normal">Block</th>
							<th className="px-5 pb-3 text-right font-normal">Total</th>
						</tr>
					</thead>
					{/** biome-ignore lint/complexity/noUselessFragments: _ */}
					<ClientOnly fallback={<></>}>
						<tbody
							className="divide-dashed divide-black-white/10 [&>*:not(:last-child)]:border-b-2 [&>*:not(:last-child)]:border-black-white/10"
							style={{ minHeight: `${limit * 56}px` }}
						>
							{transactions?.map((transaction) => (
								<tr
									key={transaction.hash}
									className="transition-colors hover:bg-alt h-14"
								>
									{/* Time */}
									<td className="px-5 py-3 text-primary">
										<div className="text-xs">
											<TransactionTimestamp
												blockNumber={transaction.blockNumber}
											/>
										</div>
									</td>

									{/* Description */}
									<td className="px-5 py-3 text-primary">
										<div className="text-sm">
											<TransactionDescription transaction={transaction} />
										</div>
									</td>

									{/* Transaction Hash */}
									<td className="px-3 py-3 font-mono text-[11px] text-primary">
										<Link
											to={'/receipt/$hash'}
											params={{ hash: transaction.hash ?? '' }}
											className="hover:text-accent transition-colors"
										>
											{transaction.hash?.slice(0, 8)}...
											{transaction.hash?.slice(-6)}
										</Link>
									</td>

									{/* Block Number */}
									<td className="px-3 py-3">
										{transaction.blockNumber ? (
											<Link
												to={'/block/$id'}
												params={{
													id: Hex.toNumber(transaction.blockNumber).toString(),
												}}
												className="text-accent text-sm transition-colors hover:text-accent/80"
											>
												{Hex.toNumber(transaction.blockNumber).toString()}
											</Link>
										) : (
											<span className="text-tertiary">--</span>
										)}
									</td>

									{/* Total Value */}
									<td className="px-5 py-3 text-right font-mono text-xs">
										{(() => {
											const value = transaction.value
												? Hex.toBigInt(transaction.value)
												: 0n
											const ethAmount = parseFloat(formatEther(value))
											const dollarAmount = ethAmount * 2000

											if (dollarAmount > 1)
												return (
													<span className="text-positive">
														${dollarAmount.toFixed(2)}
													</span>
												)

											return (
												<span className="text-tertiary">
													(${dollarAmount.toFixed(2)})
												</span>
											)
										})()}
									</td>
								</tr>
							))}
						</tbody>
					</ClientOnly>
				</table>
			</div>

			<div className="font-mono flex flex-col gap-3 border-t-2 border-dashed border-black-white/10 px-4 py-3 text-xs text-tertiary md:flex-row md:items-center md:justify-between">
				<div className="flex flex-row items-center gap-2">
					<button
						type="button"
						onClick={() => goToPage(page - 1)}
						disabled={page <= 1 || showLoading}
						className="rounded-lg border border-border-primary bg-surface px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-alt disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Previous page"
					>
						Previous
					</button>

					<div className="flex items-center gap-1.5 px-2">
						{(() => {
							// Show up to 5 consecutive pages centered around current page
							const maxButtons = 5
							let startPage = Math.max(1, page - Math.floor(maxButtons / 2))
							const endPage = Math.min(totalPages, startPage + maxButtons - 1)

							// Adjust start if we're near the end
							startPage = Math.max(1, endPage - maxButtons + 1)

							const pages: (number | 'ellipsis')[] = []

							// Add first page + ellipsis if needed
							if (startPage > 1) {
								pages.push(1)
								if (startPage > 2) pages.push('ellipsis')
							}

							// Add the range of pages
							for (let i = startPage; i <= endPage; i++) {
								pages.push(i)
							}

							// Add ellipsis + last page if needed
							if (endPage < totalPages) {
								if (endPage < totalPages - 1) {
									pages.push('ellipsis')
								}
								pages.push(totalPages)
							}

							let ellipsisCount = 0
							return pages.map((p) => {
								if (p === 'ellipsis') {
									ellipsisCount++
									return (
										<span
											key={'ellipsis-${ellipsisCount}'}
											className="text-tertiary px-1"
										>
											...
										</span>
									)
								}
								return (
									<button
										key={p}
										type="button"
										onClick={() => goToPage(p)}
										disabled={showLoading}
										className={`flex size-7 items-center justify-center rounded transition-colors ${
											page === p
												? 'bg-accent text-white'
												: 'hover:bg-alt text-primary'
										} ${showLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
						disabled={page >= totalPages || showLoading}
						className="rounded-lg border border-border-primary bg-surface px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-alt disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Next page"
					>
						Next
					</button>
				</div>

				<div className="space-x-2">
					<span className="text-tertiary">Page</span>
					<span className="text-primary">{page}</span>
					<span className="text-tertiary">of</span>
					<span className="text-primary">{totalPages}</span>
					<span className="text-tertiary">•</span>
					<span className="text-primary">{totalTransactions || '...'}</span>
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

function AssetRow({ contractAddress }: { contractAddress: Address.Address }) {
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
					{metadata?.symbol || '???'}
				</Link>
			</td>
			<td className="px-5 py-3 text-primary">USD</td>
			<td className="px-5 py-3 text-right font-mono text-xs text-primary">
				{formatUnits(balance ?? 0n, metadata?.decimals ?? 6)}
			</td>
			<td className="px-5 py-3 text-right font-mono text-xs text-primary">
				{typeof balance === 'bigint' && metadata?.decimals
					? `${PriceFormatter.format(Number(balance), metadata.decimals)}`
					: null}
			</td>
		</tr>
	)
}

function TransactionDescription({ transaction }: { transaction: Transaction }) {
	const { data: receipt, isLoading } = useTransactionReceipt({
		hash: transaction.hash,
		query: {
			enabled: Boolean(transaction.hash),
		},
	})

	const knownEvents = React.useMemo(() => {
		if (!receipt) return []
		return parseKnownEvents(receipt)
	}, [receipt])

	if (isLoading) return <span className="text-tertiary">Loading...</span>

	if (!knownEvents || knownEvents.length === 0)
		return <span className="text-tertiary">Processing...</span>

	const event = knownEvents[0]

	return (
		<div className="text-primary">
			{event.parts.map((part, index) => (
				<EventPart
					key={`${part.type}-${index}`}
					part={part}
					isLast={index === event.parts.length - 1}
				/>
			))}
			{event.note && (
				<span className="text-tertiary"> (note: {event.note})</span>
			)}
		</div>
	)
}

function EventPart({
	part,
	isLast,
}: {
	part: KnownEventPart
	isLast: boolean
}) {
	// Call hooks unconditionally at the top level
	const tokenAddress =
		part.type === 'amount'
			? part.value.token
			: part.type === 'token'
				? part.value.address
				: undefined
	const { data: metadata } = Hooks.token.useGetMetadata({
		token: tokenAddress,
		query: {
			enabled: Boolean(tokenAddress),
		},
	})

	const renderPart = () => {
		switch (part.type) {
			case 'action':
				return (
					<span className="flex flex-row justify-center items-center px-[5px] py-[4px] bg-base-alt leading-[16px] w-auto">
						{part.value}
					</span>
				)

			case 'account':
				return (
					<Link
						to={'/account/$address'}
						params={{ address: part.value }}
						className="text-accent hover:text-accent/80 transition-colors"
					>
						{part.value.slice(0, 6)}...{part.value.slice(-4)}
					</Link>
				)

			case 'amount': {
				const decimals = part.value.decimals ?? metadata?.decimals ?? 6
				return (
					<>
						<span className="font-semibold">
							{formatUnits(part.value.value, decimals)}
						</span>{' '}
						<Link
							to={'/token/$address'}
							params={{ address: part.value.token }}
							className="text-accent hover:text-accent/80 transition-colors"
						>
							{metadata?.symbol || 'TOKEN'}
						</Link>
					</>
				)
			}

			case 'token':
				return (
					<Link
						to={'/token/$address'}
						params={{ address: part.value.address }}
						className="text-accent hover:text-accent/80 transition-colors"
					>
						{part.value.symbol ||
							metadata?.symbol ||
							part.value.address.slice(0, 8)}
					</Link>
				)

			case 'hex':
				return (
					<span className="font-mono text-accent">
						{part.value.slice(0, 10)}...
					</span>
				)

			case 'primary':
				return <span className="font-semibold">{part.value}</span>

			case 'secondary':
				return <span>{part.value}</span>

			case 'tick':
				return <span className="text-accent">{part.value}</span>

			default:
				return null
		}
	}

	return (
		<>
			<div className="inline-block">{renderPart()}</div>
			{!isLast && ' '}
		</>
	)
}

function TransactionTimestamp({
	blockNumber,
}: {
	blockNumber: Hex.Hex | null | undefined
}) {
	const { data: timestamp } = useBlock({
		blockNumber: blockNumber ? Hex.toBigInt(blockNumber) : undefined,
		query: {
			enabled: Boolean(blockNumber),
			select: (block) => block.timestamp,
		},
	})

	const [, forceUpdate] = React.useReducer((x) => x + 1, 0)

	// Update every second to keep time live
	React.useEffect(() => {
		const interval = setInterval(forceUpdate, 1000)
		return () => clearInterval(interval)
	}, [])

	if (!timestamp) return <span className="text-tertiary">--</span>

	// Convert Unix timestamp to readable format
	const date = new Date(Number(timestamp) * 1_000)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffSec = Math.floor(diffMs / 1000)
	const diffMin = Math.floor(diffSec / 60)
	const diffHour = Math.floor(diffMin / 60)
	const diffDay = Math.floor(diffHour / 24)

	let timeAgo: string
	if (diffSec < 60) timeAgo = `${diffSec}s ago`
	else if (diffMin < 60) timeAgo = `${diffMin}m ago`
	else if (diffHour < 24) timeAgo = `${diffHour}h ago`
	else timeAgo = `${diffDay}d ago`

	return (
		<span className="text-tertiary" title={date.toLocaleString()}>
			{timeAgo}
		</span>
	)
}
