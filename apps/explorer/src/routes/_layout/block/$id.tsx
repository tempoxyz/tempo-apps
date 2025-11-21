import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Hex, Value } from 'ox'
import * as React from 'react'
import { Abis } from 'tempo.ts/viem'
import type { Block as BlockType } from 'viem'
import { decodeFunctionData, isHex, zeroAddress } from 'viem'
import { useBlock, useChains, useWatchBlockNumber } from 'wagmi'
import { getTransactionReceiptQueryOptions } from 'wagmi/query'
import { Address as AddressLink } from '#components/Address.tsx'
import { EventDescription } from '#components/EventDescription'
import { NotFound } from '#components/NotFound.tsx'
import { cx } from '#cva.config.ts'
import { DateFormatter, HexFormatter, PriceFormatter } from '#lib/formatting.ts'
import { useCopy } from '#lib/hooks.ts'
import { type KnownEvent, parseKnownEvents } from '#lib/known-events.ts'
import { TokenMetadata } from '#lib/token-metadata.ts'
import { config, queryClient } from '#wagmi.config.ts'
import ChevronDown from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'

const combinedAbi = Object.values(Abis).flat()

type BlockIdentifier =
	| { kind: 'hash'; blockHash: Hex.Hex }
	| { kind: 'number'; blockNumber: bigint }

type BlockWithTransactions = BlockType<bigint, true>
type BlockTransaction = BlockWithTransactions['transactions'][number]

export const Route = createFileRoute('/_layout/block/$id')({
	component: RouteComponent,
	notFoundComponent: NotFound,
	params: {
		parse: (params) => {
			if (!params?.id) throw notFound()
			return { id: params.id }
		},
	},
	loader: async ({ params }) => {
		const { id } = params
		if (isHex(id)) {
			Hex.assert(id)
			return {
				kind: 'hash',
				blockHash: id as Hex.Hex,
			} satisfies BlockIdentifier
		}

		const parsedNumber = Number(id)
		if (Number.isSafeInteger(parsedNumber))
			return {
				kind: 'number',
				blockNumber: BigInt(parsedNumber),
			} satisfies BlockIdentifier

		throw notFound()
	},
})

function RouteComponent() {
	const blockRef = Route.useLoaderData()

	const blockQuery = useBlock<true>({
		includeTransactions: true,
		...(blockRef.kind === 'hash'
			? { blockHash: blockRef.blockHash }
			: { blockNumber: blockRef.blockNumber }),
		query: {
			refetchOnWindowFocus: false,
			staleTime: 30_000,
		},
	})
	const block = blockQuery.data
	const isLoading = blockQuery.isPending

	const [chain] = useChains()
	const decimals = chain?.nativeCurrency.decimals ?? 18
	const symbol = chain?.nativeCurrency.symbol ?? 'UNIT'

	const requestedNumber =
		blockRef.kind === 'number' ? blockRef.blockNumber : undefined

	const transactions: BlockTransaction[] = React.useMemo(() => {
		if (!block?.transactions) return []
		return block.transactions as BlockTransaction[]
	}, [block?.transactions])

	const [latestBlockNumber, setLatestBlockNumber] = React.useState<
		bigint | undefined
	>(block?.number ?? requestedNumber)

	React.useEffect(() => {
		if (!block?.number) return
		setLatestBlockNumber((current) => {
			if (!current) return block.number
			return current > block.number ? current : block.number
		})
	}, [block?.number])

	useWatchBlockNumber({
		enabled: true,
		onBlockNumber(nextNumber) {
			setLatestBlockNumber((current) => {
				if (!current) return nextNumber
				return current > nextNumber ? current : nextNumber
			})
		},
	})

	return (
		<section className="w-full flex-1 flex justify-center px-4 sm:px-6 lg:px-10 pt-8 pb-12">
			<div
				className={cx(
					'grid w-full max-w-[1280px] gap-[14px] min-w-0',
					'min-[1240px]:grid-cols-[auto_1fr] min-[1240px]:pt-20 pt-10',
					'*:min-w-0 *:max-w-full',
				)}
			>
				<div className={cx('min-[1240px]:max-w-74')}>
					<BlockSummaryCard
						block={block}
						isLoading={isLoading}
						latestBlockNumber={latestBlockNumber}
						requestedNumber={requestedNumber}
					/>
				</div>
				<div className={cx('min-[1240px]:max-w-full')}>
					<BlockTransactionsCard
						isLoading={isLoading}
						transactions={transactions}
						decimals={decimals}
						symbol={symbol}
					/>
				</div>
			</div>
		</section>
	)
}

function BlockSummaryCard(props: BlockSummaryCardProps) {
	const { block, isLoading, latestBlockNumber, requestedNumber } = props
	const [showAdvanced, setShowAdvanced] = React.useState(true)

	if (isLoading) return <BlockSummarySkeleton />

	if (!block)
		return (
			<article className="font-mono rounded-[10px] border border-card-border bg-card-header overflow-hidden shadow-[0px_12px_40px_rgba(0,0,0,0.06)] px-[18px] py-[18px] text-base-content-secondary">
				<span>Awaiting block data…</span>
			</article>
		)

	const blockNumberValue = block.number ?? requestedNumber
	const formattedNumber = formatBlockNumber(blockNumberValue)
	const leadingZeros = formattedNumber.match(/^0+/)?.[0] ?? ''
	const trailingDigits = formattedNumber.slice(leadingZeros.length)
	const confirmations =
		block.number && latestBlockNumber && latestBlockNumber >= block.number
			? Number(latestBlockNumber - block.number) + 1
			: undefined
	const utcLabel = block.timestamp
		? formatUtcTimestamp(block.timestamp)
		: undefined
	const unixLabel = block.timestamp ? block.timestamp.toString() : undefined

	const gasUsage = getGasUsagePercent(block)
	const roots = [
		{ label: 'state', value: block.stateRoot },
		{ label: 'txns', value: block.transactionsRoot },
		{ label: 'receipts', value: block.receiptsRoot },
		{ label: 'withdraws', value: block.withdrawalsRoot },
	]

	return (
		<article className="font-mono rounded-[10px] border border-card-border bg-card-header overflow-hidden shadow-[0px_12px_40px_rgba(0,0,0,0.06)]">
			<div className="px-[18px] pt-[14px] pb-[10px] border-b border-card-border">
				<div className="flex items-center justify-between">
					<span className="text-[11px] uppercase tracking-[0.32em] text-tertiary">
						Block
					</span>
					{blockNumberValue && (
						<CopyButton
							value={blockNumberValue.toString()}
							ariaLabel="Copy block number"
						/>
					)}
				</div>
				<div className="mt-[6px] text-[22px] leading-[26px] tracking-[0.18em] text-primary tabular-nums">
					<span className="text-[#bbbbbb]">{leadingZeros}</span>
					{trailingDigits || '—'}
				</div>
			</div>

			<div className="divide-y divide-card-border">
				<BlockTimeRow label="UTC" value={utcLabel} />
				<BlockTimeRow label="UNIX" value={unixLabel} subtle />

				<div className="px-[18px] py-[14px] space-y-[8px]">
					<div className="flex items-center justify-between">
						<span className="text-[11px] uppercase tracking-[0.32em] text-tertiary">
							Hash
						</span>
						{block.hash && (
							<CopyButton value={block.hash} ariaLabel="Copy block hash" />
						)}
					</div>
					<p className="text-[13px] leading-[18px] text-primary wrap-break-word">
						{block.hash ?? '—'}
					</p>
					{block.parentHash && (
						<div className="flex items-center gap-[8px] text-[13px]">
							<span className="text-tertiary">↳ Parent</span>
							<Link
								to="/block/$id"
								params={{ id: block.parentHash }}
								className="text-accent"
								title={block.parentHash}
							>
								{HexFormatter.shortenHex(block.parentHash, 6)}
							</Link>
						</div>
					)}
				</div>

				<div className="px-[18px] py-[12px] flex items-center justify-between text-[13px]">
					<span className="text-tertiary">Miner</span>
					{block.miner ? (
						<AddressLink
							address={block.miner}
							chars={4}
							className="text-accent"
						/>
					) : (
						<span className="text-tertiary">—</span>
					)}
				</div>

				<div className="px-[18px] py-[12px] flex items-center justify-between text-[13px]">
					<span className="text-tertiary">Confirmations</span>
					<span className="text-primary tabular-nums">
						{confirmations !== undefined ? confirmations.toString() : '—'}
					</span>
				</div>

				<div className="px-[18px] py-[12px]">
					<button
						type="button"
						className="flex w-full items-center justify-between text-[13px] text-tertiary"
						onClick={() => setShowAdvanced((prev) => !prev)}
					>
						<span className="uppercase tracking-[0.28em]">Advanced</span>
						<span className="flex items-center gap-[6px] text-primary text-[12px]">
							{gasUsage !== undefined ? `${gasUsage.toFixed(2)}%` : '—'}
							<ChevronDown
								className={`size-[14px] transition-transform ${showAdvanced ? '' : '-rotate-90'}`}
							/>
						</span>
					</button>

					{showAdvanced && (
						<div className="mt-[14px] space-y-[14px] text-[13px]">
							<div className="space-y-[6px]">
								<div className="flex items-center justify-between text-primary">
									<span>Gas Usage</span>
									<span className="text-primary">
										{gasUsage !== undefined ? `${gasUsage.toFixed(2)}%` : '—'}
									</span>
								</div>
								<div className="relative h-[6px] rounded-full bg-[#e8e8e8] overflow-hidden">
									<div
										className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-300"
										style={{ width: `${Math.min(100, gasUsage ?? 0)}%` }}
									/>
								</div>
								<div className="flex items-center justify-between text-[11px] text-tertiary uppercase tracking-[0.25em] tabular-nums">
									<span>{formatGasValue(block.gasUsed)}</span>
									<span>{formatGasValue(block.gasLimit)}</span>
								</div>
							</div>

							<div className="space-y-[8px]">
								<span className="text-[11px] uppercase tracking-[0.28em] text-tertiary">
									Roots
								</span>
								{roots.map((root) => (
									<div
										key={root.label}
										className="flex items-center justify-between text-primary leading-[18px]"
									>
										<span className="text-tertiary capitalize">
											{root.label}
										</span>
										<span
											className="tabular-nums"
											title={root.value ?? undefined}
										>
											{root.value
												? HexFormatter.shortenHex(root.value, 6)
												: '—'}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</article>
	)
}
interface BlockSummaryCardProps {
	block?: BlockWithTransactions
	isLoading: boolean
	latestBlockNumber?: bigint
	requestedNumber?: bigint
}

function BlockTransactionsCard(props: BlockTransactionsCardProps) {
	const { transactions, isLoading, decimals, symbol } = props

	const transactionHashes = React.useMemo(
		() => transactions.map((transaction) => transaction.hash),
		[transactions],
	)

	const { data: knownEventsByHash = {}, isFetching: isFetchingKnownEvents } =
		useQuery({
			queryKey: ['block-known-events', transactionHashes],
			enabled: transactions.length > 0,
			staleTime: 30_000,
			queryFn: async () => {
				const entries = await Promise.all(
					transactions.map(async (transaction) => {
						if (!transaction?.hash)
							return [transaction.hash ?? 'unknown', []] as const

						try {
							const receipt = await queryClient.fetchQuery(
								getTransactionReceiptQueryOptions(config, {
									hash: transaction.hash,
								}),
							)
							const tokenMetadata = await TokenMetadata.fromLogs(receipt.logs)
							const events = parseKnownEvents(receipt, {
								transaction,
								tokenMetadata,
							})

							return [transaction.hash, events] as const
						} catch (error) {
							console.error('Failed to load transaction description', {
								hash: transaction.hash,
								error,
							})
							return [transaction.hash, []] as const
						}
					}),
				)

				return Object.fromEntries(
					entries.filter(([hash]) => Boolean(hash)),
				) as Record<Hex.Hex, KnownEvent[]>
			},
		})

	const displayRows: Array<BlockTransaction | undefined> =
		transactions.length > 0
			? transactions
			: Array.from({ length: isLoading ? 7 : 0 }).map(() => undefined)

	if (!displayRows.length && !isLoading)
		return (
			<section className="flex flex-col font-mono w-full overflow-hidden rounded-[10px] border border-card-border bg-card-header shadow-[0px_12px_40px_rgba(0,0,0,0.06)] p-[24px] text-center text-base-content-secondary">
				No transactions were included in this block.
			</section>
		)

	return (
		<section
			className="flex flex-col font-mono w-full overflow-hidden rounded-[10px] border border-card-border bg-card-header shadow-[0px_12px_40px_rgba(0,0,0,0.06)]"
			aria-label="Block transactions"
		>
			<div className="flex items-center justify-between px-[18px] pt-[12px] pb-[10px] border-b border-card-border">
				<h2 className="text-[13px] font-medium text-primary">
					Transactions{' '}
					<span className="text-tertiary lowercase not-italic">
						({transactions.length})
					</span>
				</h2>
			</div>
			<div className="overflow-x-auto">
				<table className="min-w-full text-[13px] text-primary">
					<thead>
						<tr className="border-b border-dashed border-card-border text-tertiary">
							<th className="px-[16px] py-[12px] text-left font-normal">
								Index
							</th>
							<th className="px-[16px] py-[12px] text-left font-normal">
								Description
							</th>
							<th className="px-[16px] py-[12px] text-left font-normal">
								Hash
							</th>
							<th className="px-[16px] py-[12px] text-right font-normal">
								Fee
							</th>
							<th className="px-[16px] py-[12px] text-right font-normal">
								Total
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-dashed divide-card-border">
						{displayRows.map((transaction, index) => {
							const isPlaceholder = !transaction
							const transactionIndex =
								!isPlaceholder &&
								(transaction.transactionIndex ?? null) !== null
									? Number(transaction.transactionIndex) + 1
									: index + 1
							const amountDisplay = !isPlaceholder
								? formatNativeAmount(transaction.value, decimals, symbol)
								: '—'
							const fee = !isPlaceholder
								? getEstimatedFee(transaction)
								: undefined
							const feeDisplay =
								fee !== undefined && fee > 0n
									? formatNativeAmount(fee, decimals, symbol)
									: '—'
							const feeOutput = feeDisplay === '—' ? '—' : `(${feeDisplay})`
							const hashCell =
								!isPlaceholder && transaction.hash ? (
									<Link
										to="/tx/$hash"
										params={{ hash: transaction.hash }}
										className="text-accent font-mono"
										title={transaction.hash}
									>
										{HexFormatter.shortenHex(transaction.hash, 6)}
									</Link>
								) : (
									<span className="text-tertiary">—</span>
								)
							const totalClass =
								!isPlaceholder && transaction.value > 0n
									? 'text-base-content-positive'
									: 'text-primary'
							const knownEvents =
								!isPlaceholder && transaction.hash
									? knownEventsByHash[transaction.hash]
									: undefined

							return (
								<tr
									key={transaction?.hash ?? `placeholder-${index}`}
									className="bg-card"
								>
									<td className="px-[16px] py-[12px] align-top text-tertiary tabular-nums">
										[{transactionIndex}]
									</td>
									<td className="px-[16px] py-[12px] align-top">
										{!isPlaceholder ? (
											<TransactionDescription
												transaction={transaction}
												amountDisplay={amountDisplay}
												knownEvents={knownEvents}
												isLoading={isFetchingKnownEvents}
											/>
										) : (
											<span className="text-tertiary">Loading…</span>
										)}
									</td>
									<td className="px-[16px] py-[12px] align-top">{hashCell}</td>
									<td className="px-[16px] py-[12px] align-top text-right text-base-content-secondary">
										{feeOutput}
									</td>
									<td
										className={`px-[16px] py-[12px] align-top text-right tabular-nums ${totalClass}`}
									>
										{amountDisplay}
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</section>
	)
}

interface BlockTransactionsCardProps {
	transactions: BlockTransaction[]
	isLoading: boolean
	decimals: number
	symbol: string
}

function TransactionDescription(props: TransactionDescriptionProps) {
	const { transaction, amountDisplay, knownEvents, isLoading } = props

	const decodedCall = React.useMemo(() => {
		const data = transaction.input
		if (!data || data === '0x') return undefined
		try {
			return decodeFunctionData({ abi: combinedAbi, data })
		} catch {
			return undefined
		}
	}, [transaction.input])

	const selector = transaction.input?.slice(0, 10)

	const { title, subtitle } = React.useMemo(() => {
		if (!decodedCall)
			return {
				title: selector ?? 'Call',
				subtitle: undefined,
			}

		if (decodedCall.functionName === 'finalizeStreams') {
			const ts = decodedCall.args?.[0]
			const asBigInt = typeof ts === 'bigint' ? ts : undefined
			return {
				title: 'Finalize reward streams',
				subtitle:
					asBigInt !== undefined
						? `at ${DateFormatter.format(asBigInt)} (unix ${asBigInt})`
						: undefined,
			}
		}

		if (decodedCall.functionName === 'executeBlock') {
			return {
				title: 'Execute orderbook block',
				subtitle: 'Settle stablecoin exchange batch',
			}
		}

		return {
			title: decodedCall.functionName
				? `${decodedCall.functionName}()`
				: (selector ?? 'Call'),
			subtitle: undefined,
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [decodedCall?.functionName, decodedCall?.args, selector, decodedCall])

	if (knownEvents && knownEvents.length > 0) {
		const [firstEvent, ...rest] = knownEvents
		return (
			<div className="inline-flex items-center gap-[8px] text-primary flex-wrap">
				<EventDescription
					event={firstEvent}
					className="flex flex-row items-center gap-[6px]"
				/>
				{rest.length > 0 && (
					<span className="text-tertiary whitespace-nowrap">
						+{rest.length} more
					</span>
				)}
			</div>
		)
	}

	if (isLoading) return <span className="text-tertiary">Analyzing…</span>

	if (!transaction.to)
		return (
			<span className="text-primary">
				Deploy contract with{' '}
				<span className="text-base-content-positive font-medium">
					{amountDisplay}
				</span>
			</span>
		)

	if (transaction.value === 0n)
		return (
			<div className="flex flex-col gap-[2px]">
				<span className="text-primary">
					{title}{' '}
					<AddressLink
						address={transaction.to}
						chars={4}
						className="text-accent font-medium"
					/>
					{transaction.from === zeroAddress && (
						<span className="text-tertiary"> (system)</span>
					)}
				</span>
				{subtitle && (
					<span className="text-base-content-secondary text-[12px]">
						{subtitle}
					</span>
				)}
			</div>
		)

	return (
		<span className="text-primary">
			Send{' '}
			<span className="font-medium text-base-content-positive">
				{amountDisplay}
			</span>{' '}
			to{' '}
			<AddressLink
				address={transaction.to}
				chars={4}
				className="text-accent font-medium"
			/>
		</span>
	)
}

interface TransactionDescriptionProps {
	transaction: BlockTransaction
	amountDisplay: string
	knownEvents?: KnownEvent[]
	isLoading: boolean
}

function BlockSummarySkeleton() {
	return (
		<article className="font-mono rounded-[10px] border border-card-border bg-card-header overflow-hidden shadow-[0px_4px_44px_rgba(0,0,0,0.05)] px-[18px] py-[18px]">
			{Array.from({ length: 8 }).map((_, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					key={index}
					className="h-[16px] bg-base-border/50 rounded-full animate-pulse mb-[10px]"
				/>
			))}
		</article>
	)
}

function BlockTimeRow(props: {
	label: string
	value?: string
	subtle?: boolean
}) {
	const { label, value, subtle } = props
	return (
		<div className="px-[18px] py-[12px] flex items-center justify-between text-[13px] leading-[18px]">
			<span className="inline-flex items-center gap-[8px]">
				<span className="text-[11px] uppercase text-tertiary bg-base-alt/80 px-[6px] py-[3px] rounded-[4px] tracking-[0.18em]">
					{label}
				</span>
			</span>
			<span
				className={cx(
					'text-right tabular-nums',
					subtle ? 'text-base-content-secondary' : 'text-primary',
				)}
			>
				{value ?? '—'}
			</span>
		</div>
	)
}

function CopyButton(props: { value: string; ariaLabel: string }) {
	const { value, ariaLabel } = props
	const { copy, notifying } = useCopy()
	return (
		<button
			type="button"
			onClick={() => copy(value)}
			className="flex items-center gap-[4px] text-tertiary hover:text-primary transition-colors text-[12px]"
			aria-label={ariaLabel}
		>
			<CopyIcon className="size-[14px]" />
			{notifying && (
				<span className="text-[10px] uppercase tracking-widest text-primary">
					copied
				</span>
			)}
		</button>
	)
}

function formatBlockNumber(value?: bigint) {
	if (!value) return '—'
	const base = value.toString()
	return base.padStart(12, '0')
}

function formatGasValue(value?: bigint, digits = 9) {
	if (value === undefined) return '—'
	const string = value.toString()
	return string.length >= digits ? string : string.padStart(digits, '0')
}

function formatUtcTimestamp(timestamp: bigint) {
	return new Intl.DateTimeFormat('en-US', {
		year: '2-digit',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
		timeZone: 'UTC',
	}).format(new Date(Number(timestamp) * 1_000))
}

function getGasUsagePercent(block: BlockWithTransactions) {
	if (!block.gasUsed || !block.gasLimit) return undefined
	const used = Number(block.gasUsed)
	const limit = Number(block.gasLimit)
	if (!limit) return undefined
	return (used / limit) * 100
}

function getEstimatedFee(transaction: BlockTransaction) {
	const gasPrice =
		transaction.gasPrice ??
		('maxFeePerGas' in transaction && transaction.maxFeePerGas
			? transaction.maxFeePerGas
			: 0n)
	return gasPrice * (transaction.gas ?? 0n)
}

function formatNativeAmount(
	value: bigint | undefined,
	decimals: number,
	symbol: string,
) {
	if (value === undefined) return '—'
	const decimalString = Value.format(value, decimals)
	const formatted = PriceFormatter.formatAmount(decimalString)
	return `${formatted} ${symbol}`
}
