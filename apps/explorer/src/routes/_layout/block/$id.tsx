import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from '@tanstack/react-router'
import { Hex, Value } from 'ox'
import * as React from 'react'
import type { Block as BlockType } from 'viem'
import { isHex } from 'viem'
import { useBlock, useChains, useWatchBlockNumber } from 'wagmi'
import { Address as AddressLink } from '#components/Address'
import { ExploreInput } from '#components/ExploreInput'
import { NotFound } from '#components/NotFound'
import { RelativeTime } from '#components/RelativeTime'
import { HexFormatter, PriceFormatter } from '#lib/formatting'
import SquareSquare from '~icons/lucide/square-square'

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
	const navigate = useNavigate()
	const blockRef = Route.useLoaderData() as BlockIdentifier
	const [searchValue, setSearchValue] = React.useState('')

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
	const hasError = blockQuery.isError

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

	const displayedNumber = block?.number ?? requestedNumber

	return (
		<section className="w-full flex-1 flex justify-center px-4 sm:px-6 lg:px-10 pt-6 pb-12">
			<div className="w-full max-w-[1180px] flex flex-col gap-6">
				<div className="flex items-center justify-end text-[15px] text-base-content-secondary gap-[8px]">
					<SquareSquare className="size-[18px] text-accent" />
					<span className="font-medium">
						Block {displayedNumber ? displayedNumber.toString() : '…'}
					</span>
				</div>

				<div className="w-full flex justify-center">
					<div className="w-full max-w-[520px]">
						<ExploreInput
							value={searchValue}
							size="large"
							onChange={setSearchValue}
							onAddress={(address) => {
								navigate({ to: '/account/$address', params: { address } })
							}}
							onHash={(hash) => {
								navigate({ to: '/tx/$hash', params: { hash } })
							}}
							onActivate={({ type, value }) => {
								if (type === 'address') {
									navigate({
										to: '/account/$address',
										params: { address: value },
									})
									return
								}
								if (type === 'hash') {
									navigate({ to: '/tx/$hash', params: { hash: value } })
									return
								}
								if (/^\d+$/.test(value)) {
									navigate({ to: '/block/$id', params: { id: value } })
									return
								}
								if (value.startsWith('0x')) {
									navigate({ to: '/block/$id', params: { id: value } })
								}
							}}
						/>
					</div>
				</div>

				{hasError ? (
					<BlockError />
				) : (
					<div className="grid gap-6 lg:grid-cols-[340px,1fr]">
						<BlockSummaryCard
							block={block}
							isLoading={isLoading}
							latestBlockNumber={latestBlockNumber}
							requestedNumber={requestedNumber}
						/>
						<TransactionsPanel
							isLoading={isLoading}
							transactions={transactions}
							decimals={decimals}
							symbol={symbol}
						/>
					</div>
				)}
			</div>
		</section>
	)
}

function BlockSummaryCard(props: BlockSummaryCardProps) {
	const { block, isLoading, latestBlockNumber, requestedNumber } = props

	if (isLoading) return <BlockSummarySkeleton />

	if (!block)
		return (
			<article className="rounded-[16px] border border-card-border bg-card shadow-[0px_30px_80px_rgba(15,23,42,0.08)] px-6 py-5 font-mono text-[13px] text-base-content-secondary">
				<span>Awaiting block data…</span>
			</article>
		)

	const formattedNumber = formatBlockNumber(block.number ?? requestedNumber)
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
		{ label: 'State', value: block.stateRoot },
		{ label: 'Txns', value: block.transactionsRoot },
		{ label: 'Receipts', value: block.receiptsRoot },
		{ label: 'Withdrawals', value: block.withdrawalsRoot },
	].filter((entry) => Boolean(entry.value))

	return (
		<article className="rounded-[16px] border border-card-border bg-card shadow-[0px_30px_80px_rgba(15,23,42,0.08)] px-6 py-5 font-mono text-[13px] text-base-content">
			<div className="flex flex-col gap-1 pb-4 border-b border-dashed border-card-border mb-4">
				<span className="text-[12px] uppercase tracking-[0.2em] text-tertiary">
					Block
				</span>
				<span className="text-[26px] font-semibold tracking-widest text-primary tabular-nums">
					{formattedNumber}
				</span>
				{block.timestamp && (
					<span className="text-[12px] text-base-content-secondary">
						Verified <RelativeTime timestamp={block.timestamp} />
					</span>
				)}
			</div>

			<div className="flex flex-col gap-3">
				<InfoRow label="UTC" value={utcLabel} />
				<InfoRow label="UNIX" value={unixLabel} />
				<InfoRow
					label="Hash"
					value={
						block.hash ? (
							<span title={block.hash}>
								{HexFormatter.shortenHex(block.hash, 6)}
							</span>
						) : (
							'—'
						)
					}
				/>
				<InfoRow
					label="Parent"
					value={
						block.parentHash ? (
							<Link
								to="/block/$id"
								params={{ id: block.parentHash }}
								className="text-accent"
								title={block.parentHash}
							>
								{HexFormatter.shortenHex(block.parentHash, 6)}
							</Link>
						) : (
							'—'
						)
					}
				/>
				<InfoRow
					label="Miner"
					value={
						block.miner ? (
							<AddressLink
								address={block.miner}
								chars={4}
								className="text-primary"
							/>
						) : (
							'—'
						)
					}
				/>
				<InfoRow
					label="Confirmations"
					value={confirmations !== undefined ? confirmations.toString() : '—'}
				/>
			</div>

			<div className="border-t border-dashed border-card-border mt-5 pt-4 flex flex-col gap-4">
				<div className="flex items-center justify-between text-[12px] uppercase tracking-[0.2em] text-tertiary">
					<span>Advanced</span>
					{gasUsage !== undefined && (
						<span className="tracking-normal text-[13px] text-base-content-secondary font-normal">
							Gas {gasUsage.toFixed(2)}%
						</span>
					)}
				</div>
				{block.gasUsed !== undefined && block.gasLimit !== undefined && (
					<div className="flex flex-col gap-2">
						<div className="h-[6px] rounded-full bg-base-border/40 overflow-hidden">
							<div
								className="h-full rounded-full bg-accent transition-[width] duration-300"
								style={{ width: `${Math.min(100, gasUsage ?? 0)}%` }}
							/>
						</div>
						<div className="flex items-center justify-between text-[12px] text-base-content-secondary">
							<span>{block.gasUsed.toLocaleString()}</span>
							<span>{block.gasLimit.toLocaleString()}</span>
						</div>
					</div>
				)}
				<div className="flex flex-col gap-2">
					<span className="text-[12px] uppercase tracking-[0.2em] text-tertiary">
						Roots
					</span>
					<div className="flex flex-col gap-2">
						{roots.map((root) => (
							<div
								key={root.label}
								className="flex items-center justify-between text-[12px]"
							>
								<span className="text-tertiary capitalize">{root.label}</span>
								<span title={root.value ?? undefined}>
									{root.value ? HexFormatter.shortenHex(root.value, 6) : '—'}
								</span>
							</div>
						))}
					</div>
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

function TransactionsPanel(props: TransactionsPanelProps) {
	const { transactions, isLoading, decimals, symbol } = props

	return (
		<section className="rounded-[16px] border border-card-border bg-card shadow-[0px_30px_80px_rgba(15,23,42,0.08)] overflow-hidden flex flex-col">
			<header className="flex items-center justify-between px-6 py-4 border-b border-card-border/60 text-[13px] font-medium uppercase text-tertiary">
				<span>Transactions</span>
				<span>
					({transactions.length} {transactions.length === 1 ? 'item' : 'items'})
				</span>
			</header>
			<div className="flex-1 overflow-auto">
				{isLoading ? (
					<TransactionSkeleton />
				) : transactions.length ? (
					<table className="w-full border-collapse min-w-[640px] text-[13px]">
						<thead>
							<tr className="text-tertiary text-[12px] uppercase tracking-[0.15em]">
								{['Index', 'Description', 'Hash', 'Fee', 'Total'].map(
									(header, index) => (
										<th
											key={header}
											className={`px-4 py-3 text-left font-normal ${
												index >= 3 ? 'text-right' : ''
											}`}
										>
											{header}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody>
							{transactions.map((transaction, index) => (
								<TransactionRow
									key={transaction.hash}
									transaction={transaction}
									index={index}
									decimals={decimals}
									symbol={symbol}
								/>
							))}
						</tbody>
					</table>
				) : (
					<div className="px-6 py-12 text-center text-base-content-secondary text-[14px]">
						No transactions were included in this block.
					</div>
				)}
			</div>
		</section>
	)
}

interface TransactionsPanelProps {
	transactions: BlockTransaction[]
	isLoading: boolean
	decimals: number
	symbol: string
}

function TransactionRow(props: TransactionRowProps) {
	const { transaction, index, decimals, symbol } = props
	const transactionIndex =
		(transaction?.transactionIndex ?? null) !== null
			? Number(transaction.transactionIndex) + 1
			: index + 1

	const amountDisplay = formatNativeAmount(transaction.value, decimals, symbol)
	const fee = getEstimatedFee(transaction)
	const feeDisplay = fee > 0n ? formatNativeAmount(fee, decimals, symbol) : '—'

	return (
		<tr className="border-t border-card-border/60 text-[14px]">
			<td className="px-4 py-4 align-top text-tertiary font-mono min-w-[70px]">
				[{transactionIndex}]
			</td>
			<td className="px-4 py-4 align-top">
				<div className="flex flex-col gap-1 text-[14px] text-base-content">
					<TransactionDescription
						transaction={transaction}
						amountDisplay={amountDisplay}
					/>
					<div className="text-[12px] text-tertiary">
						From{' '}
						{transaction.from ? (
							<AddressLink
								address={transaction.from}
								chars={4}
								className="text-primary"
							/>
						) : (
							'—'
						)}
					</div>
				</div>
			</td>
			<td className="px-4 py-4 align-top whitespace-nowrap font-mono">
				{transaction.hash ? (
					<Link
						to="/tx/$hash"
						params={{ hash: transaction.hash }}
						className="text-accent"
						title={transaction.hash}
					>
						{HexFormatter.shortenHex(transaction.hash, 6)}
					</Link>
				) : (
					'—'
				)}
			</td>
			<td className="px-4 py-4 text-right align-top font-mono text-base-content-secondary">
				{feeDisplay}
			</td>
			<td className="px-4 py-4 text-right align-top font-mono text-primary">
				{amountDisplay}
			</td>
		</tr>
	)
}

interface TransactionRowProps {
	transaction: BlockTransaction
	index: number
	decimals: number
	symbol: string
}

function TransactionDescription(props: TransactionDescriptionProps) {
	const { transaction, amountDisplay } = props
	if (!transaction.to) return <span>Deploy contract with {amountDisplay}</span>

	if (transaction.value === 0n)
		return (
			<span>
				Call{' '}
				<AddressLink
					address={transaction.to}
					chars={4}
					className="text-primary"
				/>
			</span>
		)

	return (
		<span>
			Send <span className="font-medium text-primary">{amountDisplay}</span> to{' '}
			<AddressLink
				address={transaction.to}
				chars={4}
				className="text-primary"
			/>
		</span>
	)
}

interface TransactionDescriptionProps {
	transaction: BlockTransaction
	amountDisplay: string
}

function TransactionSkeleton() {
	return (
		<div className="flex flex-col gap-3 px-6 py-6">
			{Array.from({ length: 6 }).map((_, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					key={index}
					className="h-[54px] bg-base-border/40 rounded-[8px] animate-pulse"
				/>
			))}
		</div>
	)
}

function BlockSummarySkeleton() {
	return (
		<article className="rounded-[16px] border border-card-border bg-card shadow-[0px_30px_80px_rgba(15,23,42,0.08)] px-6 py-5 font-mono text-[13px]">
			<div className="flex flex-col gap-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
						key={index}
						className="h-[16px] bg-base-border/50 rounded-full animate-pulse"
					/>
				))}
			</div>
		</article>
	)
}

function InfoRow(props: { label: string; value?: React.ReactNode }) {
	const { label, value } = props
	return (
		<div className="flex items-center justify-between gap-4 text-[13px]">
			<span className="text-tertiary uppercase tracking-[0.2em]">{label}</span>
			<span className="text-right break-all text-primary">{value ?? '—'}</span>
		</div>
	)
}

function BlockError() {
	return (
		<div className="rounded-[16px] border border-card-border bg-card shadow-[0px_30px_80px_rgba(15,23,42,0.08)] px-6 py-10 text-center text-base-content-secondary text-[14px]">
			Unable to load this block. The identifier might be wrong or the block has
			not been produced yet.
		</div>
	)
}

function formatBlockNumber(value?: bigint) {
	if (!value) return '—'
	const base = value.toString()
	return base.padStart(12, '0')
}

function formatUtcTimestamp(timestamp: bigint) {
	return new Date(Number(timestamp) * 1_000).toLocaleString(undefined, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
		timeZone: 'UTC',
	})
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

function formatNativeAmount(value: bigint, decimals: number, symbol: string) {
	const decimalString = Value.format(value, decimals)
	const formatted = PriceFormatter.formatAmount(decimalString)
	return `${formatted} ${symbol}`
}
