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

import { Address as AddressLink } from '#components/Address.tsx'
import { ExploreInput } from '#components/ExploreInput.tsx'
import { NotFound } from '#components/NotFound.tsx'
import { RelativeTime } from '#components/RelativeTime.tsx'
import { Sections } from '#components/Sections.tsx'
import { HexFormatter, PriceFormatter } from '#lib/formatting.ts'
import { useMediaQuery } from '#lib/hooks.ts'

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

		const _parsedNumber = Number(id)
		if (Number.isSafeInteger(parsedNumber))
			return {
				kind: 'number',
				blockNumber: BigInt(parsedNumber),
			} satisfies BlockIdentifier

		throw notFound()
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

	return (
		<section className="w-full flex-1 flex justify-center px-4 sm:px-6 lg:px-10 pt-8 pb-12">
			<div className="grid w-full max-w-[1080px] gap-[14px] min-w-0 min-[1240px]:grid-cols-[340px,minmax(0,1fr)]">
				<div className="min-[1240px]:col-span-2 flex flex-col gap-4 items-center">
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
				</div>

				{hasError ? (
					<div className="min-[1240px]:col-span-2">
						<BlockError />
					</div>
				) : (
					<>
						<div className="min-w-0">
							<BlockSummaryCard
								block={block}
								isLoading={isLoading}
								latestBlockNumber={latestBlockNumber}
								requestedNumber={requestedNumber}
							/>
						</div>
						<div className="min-w-0">
							<BlockTransactionsCard
								isLoading={isLoading}
								transactions={transactions}
								decimals={decimals}
								symbol={symbol}
							/>
						</div>
					</>
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
			<article className="font-mono rounded-[10px] border border-card-border bg-card-header overflow-hidden shadow-[0px_4px_44px_rgba(0,0,0,0.05)] px-[18px] py-[18px] text-base-content-secondary">
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
		<article className="font-mono rounded-[10px] border border-card-border bg-card-header overflow-hidden shadow-[0px_4px_44px_rgba(0,0,0,0.05)]">
			<header className="text-[13px] uppercase text-tertiary px-[18px] pt-[12px] pb-[8px]">
				Block
			</header>
			<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-px -mx-px px-[18px] py-[20px] flex flex-col gap-[18px]">
				<div className="flex flex-col gap-[6px] border-b border-dashed border-card-border pb-[16px]">
					<div className="text-[28px] font-semibold tracking-[0.18em] text-primary tabular-nums">
						{formattedNumber}
					</div>
					{block.timestamp && (
						<span className="text-[12px] text-base-content-secondary">
							Verified <RelativeTime timestamp={block.timestamp} />
						</span>
					)}
				</div>

				<div className="flex flex-col gap-[12px]">
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

				<div className="flex flex-col gap-[16px] border-t border-dashed border-card-border pt-[16px]">
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
	const isMobile = useMediaQuery('(max-width: 1239px)')
	const mode: 'tabs' | 'stacked' = isMobile ? 'stacked' : 'tabs'

	if (!transactions.length && !isLoading)
		return (
			<section className="flex flex-col font-mono w-full overflow-hidden rounded-[10px] border border-card-border bg-card-header shadow-[0px_4px_44px_rgba(0,0,0,0.05)] p-[24px] text-center text-base-content-secondary">
				No transactions were included in this block.
			</section>
		)

	const totalItems = Math.max(transactions.length, isLoading ? 1 : 0)
	const itemsPerPage = Math.max(transactions.length, 1)

	const section: Sections.Section = {
		title: `Transactions`,
		columns: {
			tabs: [
				{ label: 'Index', minWidth: 80 },
				{ label: 'Description', minWidth: 260 },
				{ label: 'Hash', minWidth: 140 },
				{ label: 'Fee', align: 'end', minWidth: 120 },
				{ label: 'Total', align: 'end', minWidth: 120 },
			],
			stacked: [
				{ label: '#', minWidth: 60 },
				{ label: 'Details', minWidth: 200 },
				{ label: 'Amount', align: 'end', minWidth: 120 },
			],
		},
		items: (currentMode) =>
			transactions.map((transaction, index) =>
				buildTransactionCells({
					transaction,
					index,
					decimals,
					symbol,
					mode: currentMode,
				}),
			),
		totalItems,
		page: 1,
		isPending: isLoading,
		onPageChange: () => {},
		itemsLabel: 'transactions',
		itemsPerPage,
	}

	const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))

	return (
		<section
			className="flex flex-col font-mono w-full overflow-hidden rounded-[10px] border border-card-border bg-card-header shadow-[0px_4px_44px_rgba(0,0,0,0.05)]"
			aria-label="Block transactions"
		>
			<div className="flex items-center justify-between px-[18px] pt-[12px] pb-[8px]">
				<h2 className="text-[13px] font-medium uppercase text-primary">
					Transactions{' '}
					<span className="text-tertiary lowercase not-italic">
						({transactions.length})
					</span>
				</h2>
			</div>
			<div className="rounded-t-[10px] border-t border border-card-border bg-card -mb-px -mx-px flex flex-col min-h-0">
				<Sections.SectionContent
					section={section}
					totalPages={totalPages}
					itemsLabel="transactions"
					itemsPerPage={itemsPerPage}
					mode={mode}
				/>
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

function buildTransactionCells(params: {
	transaction: BlockTransaction
	index: number
	decimals: number
	symbol: string
	mode: 'tabs' | 'stacked'
}) {
	const { transaction, index, decimals, symbol, mode } = params
	const transactionIndex =
		(transaction?.transactionIndex ?? null) !== null
			? Number(transaction.transactionIndex) + 1
			: index + 1
	const amountDisplay = formatNativeAmount(transaction.value, decimals, symbol)
	const fee = getEstimatedFee(transaction)
	const feeDisplay = fee > 0n ? formatNativeAmount(fee, decimals, symbol) : '—'

	const hashLink = transaction.hash ? (
		<Link
			to="/tx/$hash"
			params={{ hash: transaction.hash }}
			className="text-accent font-mono text-[13px]"
			title={transaction.hash}
		>
			{HexFormatter.shortenHex(transaction.hash, 6)}
		</Link>
	) : (
		'—'
	)

	const fromRow = (
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
	)

	if (mode === 'stacked')
		return [
			<span key="index" className="text-tertiary font-mono">
				[{transactionIndex}]
			</span>,
			<div key="description" className="flex flex-col gap-[6px]">
				<TransactionDescription
					transaction={transaction}
					amountDisplay={amountDisplay}
				/>
				{hashLink !== '—' && <div className="text-[12px]">{hashLink}</div>}
				{fromRow}
			</div>,
			<div key="fee" className="flex flex-col items-end gap-[4px] text-[13px]">
				<span className="text-base-content-secondary font-mono">
					Fee {feeDisplay}
				</span>
				<span className="text-primary font-mono font-medium">
					{amountDisplay}
				</span>
			</div>,
		]

	return [
		<span key="index" className="text-tertiary font-mono">
			[{transactionIndex}]
		</span>,
		<div key="description" className="flex flex-col gap-[6px]">
			<TransactionDescription
				transaction={transaction}
				amountDisplay={amountDisplay}
			/>
			{fromRow}
		</div>,
		hashLink,
		<span key="fee" className="text-base-content-secondary font-mono">
			{feeDisplay}
		</span>,
		<span key="amount" className="text-primary font-mono font-medium">
			{amountDisplay}
		</span>,
	]
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
		<div className="font-mono rounded-[10px] border border-card-border bg-card-header shadow-[0px_4px_44px_rgba(0,0,0,0.05)] px-[24px] py-[32px] text-center text-base-content-secondary text-[14px]">
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
