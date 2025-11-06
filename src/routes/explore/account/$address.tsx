import { useQuery } from '@tanstack/react-query'
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouterState,
} from '@tanstack/react-router'
import {
	ArrowRight,
	ChevronLeft,
	ChevronRight,
	Copy,
	CopyCheck,
} from 'lucide-react'
import { Address, Hex } from 'ox'
import * as React from 'react'
import { Abis } from 'tempo.ts/viem'
import { formatEther, parseEventLogs } from 'viem'
import { useBlock, useTransactionReceipt } from 'wagmi'
import { z } from 'zod/mini'
import { useInfiniteTransactions } from '#explore/-lib/Hooks.tsx'
import { useCopyToClipboard } from '#hooks/use-copy-to-clipboard.ts'

export const Route = createFileRoute('/explore/account/$address')({
	component: RouteComponent,
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
	const [isCopied, copyToClipboard] = useCopyToClipboard()

	const { data: transactions } = useInfiniteTransactions()

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

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr] font-mono">
					{/* Account Info */}
					<aside className="h-fit rounded-xl border-2 border-border-primary bg-surface pb-3">
						<h2 className="text-sm font-medium uppercase tracking-[0.15em] text-primary px-5 pt-5">
							Account
						</h2>
						<div className="flex items-center justify-start gap-2 mt-2 px-5">
							<span className="text-sm tracking-wider text-tertiary">
								Address
							</span>
							<button
								type="button"
								onClick={() => copyToClipboard(address)}
								className="inline-flex items-center text-tertiary transition-colors hover:text-primary"
								aria-live="polite"
							>
								{isCopied ? (
									<CopyCheck className="size-4" aria-hidden />
								) : (
									<Copy className="size-4" aria-hidden />
								)}
							</button>
						</div>
						<p className="break-all font-mono text-sm leading-relaxed text-primary px-5">
							{address}
						</p>
						<div className="outline outline-primary outline-dashed outline-x-0 mt-3 opacity-20 w-[99.5%] mx-auto" />
						<div className="flex flex-row w-full justify-between text-xs px-2.5 h-10">
							<div className="flex flex-row justify-between w-1/2 my-auto">
								<span className="text-tertiary">Active</span>
								<span className="text-primary">12h ago</span>
							</div>
							<div className="my-0.5 outline outline-primary outline-dashed w-0 outline-x-0 mx-4 opacity-20" />
							<div className="flex flex-row justify-between w-1/2 my-auto">
								<span className="text-tertiary">Created</span>
								<span className="text-primary">30d ago</span>
							</div>
						</div>
						<div className="outline outline-primary outline-dashed outline-x-0 opacity-20 w-[99.5%] mx-auto" />
						<div className="flex flex-row justify-between text-xs px-3 mt-2.5">
							<span className="text-tertiary">Holdings</span>
							<span className="text-primary">$1,234.56</span>
						</div>
					</aside>

					<section className="flex flex-col gap-6">
						{/* History */}
						<div className="overflow-hidden rounded-xl border-2 border-border-primary bg-surface">
							<div className="overflow-x-auto pt-3">
								<table className="w-full border-collapse text-sm">
									<thead>
										<tr className="border-dashed border-b-2 border-black-white/10 text-left text-xs tracking-wider text-tertiary">
											<th className="px-5 pb-3 font-semibold tracking-[0.15em] text-primary uppercase">
												History
											</th>
											<th className="px-5 pb-3 font-normal">Time (GMT)</th>
											<th className="px-3 pb-3 font-normal">Block</th>
											<th className="px-3 pb-3 font-normal">Hash</th>
											<th className="px-3 pb-3 font-normal">Action(s)</th>
											<th className="px-5 pb-3 text-right font-normal">
												Total
											</th>
										</tr>
									</thead>
									<tbody className="divide-dashed divide-black-white/10 [&>*:not(:last-child)]:border-b-2 [&>*:not(:last-child)]:border-black-white/10">
										{transactions?.pages.at(0)?.map((transaction) => (
											<tr
												key={transaction.hash}
												className="transition-colors hover:bg-alt"
											>
												<td className="px-5 py-3 text-primary">
													<div className="text-xs">{transaction.chainId}</div>
												</td>
												<td className="px-5 py-3 text-primary">
													<div className="text-[11px]">
														<TransactionTimestamp
															blockNumber={transaction.blockNumber}
														/>
													</div>
												</td>
												<td className="px-3 py-3">
													<Link
														to={'/explore/block/$id'}
														params={{
															id:
																transaction.blockNumber?.toString() ??
																transaction.blockHash ??
																'',
														}}
														className="text-accent transition-colors hover:text-accent"
													>
														{transaction.blockNumber}
													</Link>
												</td>
												<td className="px-3 py-3 font-mono text-[11px] text-primary">
													{transaction.hash}
												</td>
												<td className="px-3 py-3 text-primary flex flex-row gap-2">
													<EventLogs hash={transaction.hash} />
												</td>
												<td className="px-5 py-3 text-right">
													{formatEther(transaction.gasPrice ?? 0n)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>

							<div className="font-mono flex flex-col gap-3 border-t-2 border-dashed border-black-white/10 px-4 py-3 text-xs text-tertiary md:flex-row md:items-center md:justify-between">
								<div className="flex flex-row items-center gap-2 text-tertiary">
									<ChevronLeft className="size-4 text-tertiary" aria-hidden />
									<span className="text-primary">1</span>
									<span className="">2</span>
									<span className="">3</span>
									<span className="">4</span>
									<span className="text-primary">...</span>
									<span className="">12</span>
									<ChevronRight className="size-4 text-accent" aria-hidden />
								</div>
								<div className="space-x-2">
									<span className="text-primary">3,021</span>
									<span className="text-tertiary">entries</span>
								</div>
							</div>
						</div>

						{/* Assets */}
						<div className="overflow-hidden rounded-xl border-2 border-border-primary bg-surface">
							<div className="overflow-x-auto pt-4">
								<table className="w-full border-collapse text-xs">
									<thead>
										<tr className="border-dashed border-b-2 border-black-white/10 text-left text-[10px] uppercase tracking-wider text-tertiary">
											<th className="px-5 pb-3 font-semibold tracking-[0.15em] text-primary">
												ASSETS
											</th>
											<th className="px-5 pb-3 font-normal">Ticker</th>
											<th className="px-3 pb-3 font-normal">Currency</th>
											<th className="px-3 pb-3 font-normal">Contract</th>
											<th className="px-3 pb-3 text-left font-normal">
												Amount
											</th>
											<th className="px-5 pb-3 text-right font-normal">
												Value
											</th>
										</tr>
									</thead>
									<tbody className="divide-dashed divide-black-white/10 [&>*:not(:last-child)]:border-b-2 [&>*:not(:last-child)]:border-black-white/10">
										{MOCK_ASSETS.map((asset) => (
											<tr
												key={asset.name}
												className="transition-colors hover:bg-alt"
											>
												<td className="px-5 py-3 text-primary">{asset.name}</td>
												<td className="px-3 py-3 text-positive">
													{asset.ticker}
												</td>
												<td className="px-3 py-3 text-primary">
													{asset.currency.toUpperCase()}
												</td>
												<td className="px-3 py-3">
													<a
														href={asset.contract.href}
														className="font-mono text-[11px] text-accent transition-colors hover:text-accent"
													>
														{asset.contract.label}
													</a>
												</td>
												<td className="px-3 py-3 text-left text-primary">
													{asset.amount.main}
													{asset.amount.sub ? (
														<span className="text-tertiary">
															{asset.amount.sub}
														</span>
													) : null}
												</td>
												<td className="px-5 py-3 text-right text-primary">
													{asset.value}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	)
}

function TransactionTimestamp({ blockNumber }: { blockNumber: bigint | null }) {
	const { data: timestamp } = useBlock({
		blockNumber: blockNumber ?? undefined,
		query: { select: (block) => block.timestamp },
	})
	return <React.Fragment>{timestamp}</React.Fragment>
}

function EventLogs(props: { hash?: Hex.Hex | undefined }) {
	const { data: receipt } = useTransactionReceipt({
		hash: props.hash ?? undefined,
		query: { enabled: Boolean(props.hash) },
	})

	const { data: events } = useQuery({
		enabled: Boolean(props.hash) && receipt?.logs && receipt.logs.length > 0,
		queryFn: async () => {
			if (!props.hash) throw new Error('hash is required')
			if (!receipt?.logs) throw new Error('receipt logs are required')

			const events = parseEventLogs({
				abi: [
					...Abis.nonce,
					...Abis.tip20,
					...Abis.feeAmm,
					...Abis.feeManager,
					...Abis.tip20Factory,
					...Abis.tip20Factory,
					...Abis.tip403Registry,
					...Abis.tip4217Registry,
					...Abis.validatorConfig,
					...Abis.stablecoinExchange,
					...Abis.tipAccountRegistrar,
					...Abis.tip20RewardsRegistry,
				],
				logs: receipt.logs,
			})
			console.info(events)

			return events
		},
		queryKey: ['event-logs', props.hash],
	})

	if (!events) return null

	return events.map((event) => (
		<div
			key={event.address}
			className="bg-black-white/5 text-black-white/75 px-1 text-center py-0.5 w-min text-xs"
		>
			<span>{event.eventName}</span>
		</div>
	))
}

const MOCK_ASSETS: Array<{
	name: string
	ticker: string
	currency: string
	contract: { label: string; href: string }
	amount: { main: string; sub?: string }
	value: string
}> = [
	{
		name: 'alphaUSD',
		ticker: 'AUSD',
		currency: 'USD',
		contract: {
			label: '0x82Fe190c...3Ed47bAA9',
			href: '/explore/token/0x82Fe190c3Ed47bAA9',
		},
		amount: { main: '1,013.315', sub: '000' },
		value: '$1,013.31',
	},
	{
		name: 'betaUSD',
		ticker: 'BUSD',
		currency: 'USD',
		contract: {
			label: '0x4b1F6a7D...6Ee8CdA32',
			href: '/explore/token/0x4b1F6a7D6Ee8CdA32',
		},
		amount: { main: '234.35', sub: '0000' },
		value: '$231.35',
	},
	{
		name: 'charlieUSD',
		ticker: 'CUSD',
		currency: 'USD',
		contract: {
			label: '0x69cAd35B...0Da91Fe45',
			href: '/explore/token/0x69cAd35B0Da91Fe45',
		},
		amount: { main: '114.33', sub: '0000' },
		value: '$110.51',
	},
]
