import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import {
	ClientOnly,
	createFileRoute,
	Link,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Address, Hex } from 'ox'
import * as React from 'react'
import { Abis } from 'tempo.ts/viem'
import { Hooks } from 'tempo.ts/wagmi'
import type { Log, RpcTransaction as Transaction } from 'viem'
import { formatEther, formatUnits, parseEventLogs } from 'viem'
import { useBlock, useClient, useTransactionReceipt } from 'wagmi'
import { getClient } from 'wagmi/actions'
import * as z from 'zod/mini'
import { config } from '#wagmi.config'

type TransactionsResponse = {
	transactions: Transaction[]
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
				(res) => res.json(),
			),
		// auto-refresh page 1 since new transactions appear there
		refetchInterval: page === 1 ? 4_000 : false,
		refetchIntervalInBackground: page === 1,
		refetchOnWindowFocus: page === 1,
		staleTime: page === 1 ? 0 : 60_000, // page 1: always fresh, others: 60s cache
	})

export const Route = createFileRoute('/explore/account/$address')({
	component: RouteComponent,
	validateSearch: z.object({
		page: z._default(z.number(), 1),
		limit: z._default(z.number(), 7),
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

function RouteComponent() {
	const navigate = useNavigate()
	const routerState = useRouterState()
	const { address } = Route.useParams()

	const client = useClient()
	const { page, limit } = Route.useSearch()
	const offset = (page - 1) * limit

	const { data } = useSuspenseQuery(
		transactionsQuery(address, page, limit, client?.chain.id ?? 0, offset),
	)

	const transactions = data.transactions
	const totalTransactions = data.total
	const totalPages = Math.ceil(totalTransactions / limit)

	const goToPage = React.useCallback(
		(newPage: number) => {
			navigate({ to: '.', search: { page: newPage, limit } })
		},
		[navigate, limit],
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
						to: '/explore/$value',
						params: { value },
					})
				} catch (error) {
					console.error('Invalid search value provided', error)
				}
			},
			[navigate],
		)

	return (
		<React.Suspense fallback={<div>Loading...</div>}>
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
							<p className="text-xs text-tertiary">
								Press <span className="font-mono text-[11px]">⌘</span>
								<span className="font-mono text-[11px]">Ctrl</span> +{' '}
								<span className="font-mono text-[11px]">K</span> to focus
							</p>
						</div>
					</section>

					<div className="grid grid-cols-1 gap-6 font-mono">
						<section className="flex flex-col gap-6 w-full">
							{/* History */}
							<div className="overflow-hidden rounded-xl border border-border-primary bg-primary">
								<div className="px-5 h-10 flex items-center">
									<h2 className="text-sm font-medium uppercase tracking-[0.15em] text-primary">
										HISTORY
									</h2>
								</div>
								<div className="overflow-x-auto pt-3 bg-surface rounded-t-lg">
									<table className="w-full border-collapse text-sm rounded-t-sm">
										<thead>
											<tr className="border-dashed border-b-2 border-black-white/10 text-left text-xs tracking-wider text-tertiary">
												<th className="px-5 pb-3 font-normal">Time</th>
												<th className="px-5 pb-3 font-normal">Description</th>
												<th className="px-3 pb-3 font-normal">Hash</th>
												<th className="px-3 pb-3 font-normal">Block</th>
												<th className="px-5 pb-3 text-right font-normal">
													Total
												</th>
											</tr>
										</thead>
										{/** biome-ignore lint/complexity/noUselessFragments: _ */}
										<ClientOnly fallback={<></>}>
											<tbody className="divide-dashed divide-black-white/10 [&>*:not(:last-child)]:border-b-2 [&>*:not(:last-child)]:border-black-white/10">
												{transactions?.map((transaction) => (
													<tr
														key={transaction.hash}
														className="transition-colors hover:bg-alt"
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
																<TransactionDescription
																	transaction={transaction}
																/>
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
																	to={'/explore/block/$id'}
																	params={{
																		id: Hex.toNumber(
																			transaction.blockNumber,
																		).toString(),
																	}}
																	className="text-accent text-sm transition-colors hover:text-accent/80"
																>
																	{Hex.toNumber(
																		transaction.blockNumber,
																	).toString()}
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
											disabled={page <= 1}
											className="rounded-lg border border-border-primary bg-surface px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-alt disabled:opacity-50 disabled:cursor-not-allowed"
											aria-label="Previous page"
										>
											Previous
										</button>

										<div className="flex items-center gap-1.5 px-2">
											{(() => {
												// Show up to 5 consecutive pages centered around current page
												const maxButtons = 5
												let startPage = Math.max(
													1,
													page - Math.floor(maxButtons / 2),
												)
												const endPage = Math.min(
													totalPages,
													startPage + maxButtons - 1,
												)

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
																key={`ellipsis-${ellipsisCount}`}
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
															className={`flex size-7 items-center justify-center rounded transition-colors ${
																page === p
																	? 'bg-accent text-white'
																	: 'hover:bg-alt text-primary'
															}`}
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
											disabled={page >= totalPages}
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
										<span className="text-primary">
											{totalTransactions || '...'}
										</span>
										<span className="text-tertiary">
											<ClientOnly fallback={<React.Fragment>¬</React.Fragment>}>
												{totalTransactions === 1
													? 'transaction'
													: 'transactions'}
											</ClientOnly>
										</span>
									</div>
								</div>
							</div>
						</section>
					</div>
				</div>
			</div>
		</React.Suspense>
	)
}

function useParseEventLogs(props: {
	hash: Hex.Hex | undefined
	logs: Array<Log> | undefined
}) {
	return React.useMemo(() => {
		if (!props.logs) return []
		if (!props.hash) return []
		return parseEventLogs({
			abi: [
				...Abis.nonce,
				...Abis.tip20,
				...Abis.feeAmm,
				...Abis.feeManager,
				...Abis.tip20Factory,
				...Abis.tip403Registry,
				...Abis.validatorConfig,
				...Abis.stablecoinExchange,
				...Abis.tipAccountRegistrar,
				...Abis.tip20RewardsRegistry,
			],
			logs: props.logs,
		})
	}, [props.logs, props.hash])
}

function TransferDescription({
	amount,
	to,
	tokenAddress,
	isSelf,
}: {
	amount: bigint
	to: string
	tokenAddress: Address.Address
	isSelf: boolean
}) {
	const { data: metadata } = Hooks.token.useGetMetadata({
		token: tokenAddress,
	})

	return (
		<span className="text-primary">
			<span>Transfer</span>{' '}
			<span className="font-semibold">
				{formatUnits(amount, metadata?.decimals ?? 6)}
			</span>{' '}
			<span className="text-accent">{metadata?.symbol || 'TOKEN'}</span>{' '}
			<span>to</span>{' '}
			<span className="text-accent">
				{to?.slice(0, 6)}...{to?.slice(-4)}
			</span>
			{isSelf && <span className="text-tertiary"> (self)</span>}
		</span>
	)
}

function TransactionDescription({ transaction }: { transaction: Transaction }) {
	const { data: receipt } = useTransactionReceipt({
		hash: transaction.hash,
		query: {
			enabled: Boolean(transaction.hash),
		},
	})
	const eventLogs = useParseEventLogs({
		hash: transaction.hash,
		logs: receipt?.logs,
	})
	const { data: metadata } = Hooks.token.useGetMetadata({
		token: eventLogs[0]?.address,
		query: {
			enabled: Boolean(eventLogs[0]?.address),
		},
	})

	if (!eventLogs || eventLogs.length === 0) {
		return <span className="text-tertiary">Processing...</span>
	}

	// biome-ignore lint/suspicious/noExplicitAny: Event types are dynamic
	const event: any = eventLogs[0]
	const eventName = event?.eventName
	const args = event?.args || {}

	// Format based on event type, showing actual data from the event
	const formatEventDescription = () => {
		// Handle Transfer events with the dedicated component
		if (eventName === 'Transfer' && args.to && args.amount !== undefined) {
			const to = args.to as string
			const amount = args.amount as bigint
			const from = args.from as string
			const tokenAddress = event.address as Address.Address // Token contract address from event
			const isSelf = from?.toLowerCase() === to?.toLowerCase()

			return (
				<TransferDescription
					amount={amount}
					to={to}
					tokenAddress={tokenAddress}
					isSelf={isSelf}
				/>
			)
		}

		// Handle Mint events
		if (eventName === 'Mint' && args.to && args.amount !== undefined) {
			const to = args.to as string
			const amount = args.amount as bigint
			const isSelf = to?.toLowerCase() === transaction.from?.toLowerCase()

			return (
				<>
					<span>Mint</span>{' '}
					<span className="font-semibold">
						{formatUnits(amount, metadata?.decimals ?? 6)}
					</span>{' '}
					<span className="text-accent">{metadata?.symbol || 'TOKEN'}</span>{' '}
					<span>to</span>{' '}
					<span className="text-accent">
						{to?.slice(0, 6)}...{to?.slice(-4)}
					</span>
					{isSelf && <span className="text-tertiary"> (self)</span>}
				</>
			)
		}

		// Handle swap events
		if (eventName === 'Swap' && (args.amount0In || args.amount0Out)) {
			const amount0 = args.amount0In || args.amount0Out
			const amount1 = args.amount1In || args.amount1Out

			return (
				<>
					<span>Swap</span>{' '}
					<span className="font-semibold">
						{formatUnits(amount0, metadata?.decimals ?? 6)}
					</span>{' '}
					<span className="text-accent">{metadata?.symbol || 'TOKEN'}</span>{' '}
					<span>for</span>{' '}
					<span className="font-semibold">
						{formatUnits(amount1, metadata?.decimals ?? 6)}
					</span>{' '}
					<span className="text-accent">{metadata?.symbol || 'TOKEN'}</span>
				</>
			)
		}

		// Handle whitelist events
		if (args.address || args.account) {
			const address = args.address || args.account
			const policyId = args.policyId || args.id

			return (
				<>
					<span>Whitelist</span>{' '}
					<span className="text-accent">
						{address?.slice(0, 6)}...{address?.slice(-4)}
					</span>{' '}
					<span>on Policy</span>{' '}
					<span className="text-accent">#{policyId?.toString()}</span>
				</>
			)
		}

		// Generic fallback - just show the event name
		return <span>{eventName || 'Transaction'}</span>
	}

	return <span className="text-primary">{formatEventDescription()}</span>
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
