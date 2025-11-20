import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Hex, Value } from 'ox'
import * as React from 'react'
import type { Block as BlockType } from 'viem'
import { isHex } from 'viem'
import { useBlock, useChains, useWatchBlockNumber } from 'wagmi'

import { Address as AddressLink } from '#components/Address.tsx'
import { NotFound } from '#components/NotFound.tsx'
import { RelativeTime } from '#components/RelativeTime.tsx'
import { Sections } from '#components/Sections.tsx'
import { cx } from '#cva.config.ts'
import { HexFormatter, PriceFormatter } from '#lib/formatting.ts'
import { useCopy, useMediaQuery } from '#lib/hooks.ts'
import ChevronDown from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'

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
					'min-[1240px]:grid-cols-[auto_1fr]',
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
			<article className="font-mono rounded-[10px] border border-card-border bg-card-header overflow-hidden shadow-[0px_4px_44px_rgba(0,0,0,0.05)] px-[18px] py-[18px] text-base-content-secondary">
				<span>Awaiting block data…</span>
			</article>
		)

	const blockNumberValue = block.number ?? requestedNumber
	const formattedNumber = formatBlockNumber(blockNumberValue)
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
		<article className="font-mono rounded-[10px] border border-card-border bg-card-header overflow-hidden shadow-[0px_4px_44px_rgba(0,0,0,0.05)]">
			<div className="flex items-center justify-between px-[18px] pt-[12px] pb-[8px] border-b border-card-border">
				<span className="text-[11px] uppercase tracking-[0.35em] text-tertiary">
					Block
				</span>
				{blockNumberValue && (
					<CopyButton
						value={blockNumberValue.toString()}
						ariaLabel="Copy block number"
					/>
				)}
			</div>
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

				<div className="flex flex-col gap-[10px]">
					<TimestampChip label="UTC" value={utcLabel} />
					<TimestampChip label="UNIX" value={unixLabel} />
				</div>

				<DetailSection
					label="Hash"
					copyValue={block.hash ?? undefined}
					value={
						<p className="text-[12px] leading-[18px] text-primary wrap-break-word">
							{block.hash ?? '—'}
						</p>
					}
				>
					{block.parentHash && (
						<div className="flex items-center gap-[6px] text-[12px]">
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
				</DetailSection>

				<DetailSection
					label="Miner"
					copyValue={block.miner ?? undefined}
					value={
						block.miner ? (
							<AddressLink
								address={block.miner}
								chars={4}
								className="text-primary"
							/>
						) : (
							<span className="text-tertiary">—</span>
						)
					}
				/>

				<DetailSection
					label="Confirmations"
					value={
						<span className="text-primary text-[13px]">
							{confirmations !== undefined ? confirmations.toString() : '—'}
						</span>
					}
				/>

				<section className="flex flex-col gap-[12px] border-t border-dashed border-card-border pt-[14px]">
					<button
						type="button"
						className="flex items-center justify-between text-[11px] uppercase tracking-[0.35em] text-tertiary cursor-pointer"
						onClick={() => setShowAdvanced((prev) => !prev)}
					>
						<span>Advanced</span>
						<span className="flex items-center gap-[6px] text-[12px] font-normal tracking-normal text-base-content-secondary">
							{gasUsage !== undefined ? `${gasUsage.toFixed(2)}%` : '—'}
							<ChevronDown
								className={`size-[14px] transition-transform ${showAdvanced ? '' : '-rotate-90'}`}
							/>
						</span>
					</button>
					{showAdvanced && (
						<div className="flex flex-col gap-[12px]">
							<div className="flex flex-col gap-[6px]">
								<div className="flex items-center justify-between text-[13px] text-primary">
									<span>Gas Usage</span>
									<span className="text-base-content-secondary">
										{gasUsage !== undefined ? `${gasUsage.toFixed(2)}%` : '—'}
									</span>
								</div>
								<div className="h-[5px] rounded-full bg-base-border/50 overflow-hidden">
									<div
										className="h-full rounded-full bg-accent transition-[width] duration-300"
										style={{ width: `${Math.min(100, gasUsage ?? 0)}%` }}
									/>
								</div>
								<div className="flex items-center justify-between text-[11px] text-tertiary uppercase tracking-wider tabular-nums">
									<span>{formatGasValue(block.gasUsed)}</span>
									<span>{formatGasValue(block.gasLimit)}</span>
								</div>
							</div>
							<div className="flex flex-col gap-[6px]">
								<span className="text-[11px] uppercase tracking-[0.35em] text-tertiary">
									Roots
								</span>
								{roots.map((root) => (
									<div
										key={root.label}
										className="flex items-center justify-between text-[12px] text-primary leading-[16px]"
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
				</section>
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

function TimestampChip(props: { label: string; value?: string }) {
	const { label, value } = props
	return (
		<div className="flex items-center gap-[10px] text-[13px] leading-[18px] capitalize">
			<span className="text-xs uppercase text-tertiary bg-base-alt/80 px-1 py-0.5">
				{label}
			</span>
			<span className="text-primary">{value ?? '—'}</span>
		</div>
	)
}

function DetailSection(props: {
	label: string
	copyValue?: string
	value?: React.ReactNode
	children?: React.ReactNode
}) {
	const { label, copyValue, value, children } = props
	return (
		<div className="flex flex-col gap-[6px]">
			<div className="flex items-center gap-[6px] text-[11px] uppercase tracking-[0.3em] text-tertiary">
				<span>{label}</span>
				{copyValue && (
					<CopyButton
						value={copyValue}
						ariaLabel={`Copy ${label.toLowerCase()}`}
					/>
				)}
			</div>
			{value ?? <span className="text-tertiary">—</span>}
			{children}
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

function formatNativeAmount(value: bigint, decimals: number, symbol: string) {
	const decimalString = Value.format(value, decimals)
	const formatted = PriceFormatter.formatAmount(decimalString)
	return `${formatted} ${symbol}`
}
