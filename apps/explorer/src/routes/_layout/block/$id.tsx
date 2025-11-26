import {
	createFileRoute,
	Link,
	notFound,
	rootRouteId,
} from '@tanstack/react-router'
import { Hex, Value } from 'ox'
import * as React from 'react'
import { Abis } from 'tempo.ts/viem'
import type { Block as BlockType } from 'viem'
import { decodeFunctionData, isHex, zeroAddress } from 'viem'
import { useChains, useWatchBlockNumber } from 'wagmi'
import { getBlock } from 'wagmi/actions'
import { Address as AddressLink } from '#components/Address.tsx'
import { EventDescription } from '#components/EventDescription'
import { NotFound } from '#components/NotFound.tsx'
import { cx } from '#cva.config.ts'
import { DateFormatter, HexFormatter, PriceFormatter } from '#lib/formatting.ts'
import { useCopy } from '#lib/hooks.ts'
import { type KnownEvent, parseKnownEvents } from '#lib/known-events.ts'
import * as Tip20 from '#lib/tip20'
import { getConfig } from '#wagmi.config.ts'
import ArrowUp10Icon from '~icons/lucide/arrow-up-10'
import ChevronDown from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'

const combinedAbi = Object.values(Abis).flat()

type BlockIdentifier =
	| { kind: 'hash'; blockHash: Hex.Hex }
	| { kind: 'number'; blockNumber: bigint }

type BlockWithTransactions = BlockType<bigint, true>
type BlockTransaction = BlockWithTransactions['transactions'][number]

interface TransactionTypeResult {
	type: 'system' | 'sub-block' | 'fee-token' | 'regular'
	label: string
}

function getTransactionType(
	transaction: BlockTransaction,
): TransactionTypeResult {
	// System transactions have from address as 0x0000...0000
	if (transaction.from === zeroAddress) {
		const systemTxNames: Record<string, string> = {
			'0x3000000000000000000000000000000000000000': 'Rewards Registry',
			'0xfeec000000000000000000000000000000000000': 'Fee Manager',
			'0xdec0000000000000000000000000000000000000': 'Stablecoin Exchange',
			'0x0000000000000000000000000000000000000000': 'Subblock Metadata',
		}
		const to = transaction.to || ''
		const name = systemTxNames[to] || 'System'
		return { type: 'system', label: name }
	}

	// Check for sub-block transactions (nonce starts with 0x5b)
	const nonceHex = transaction.nonce?.toString(16).padStart(8, '0') || ''
	if (nonceHex.startsWith('5b'))
		return { type: 'sub-block', label: 'Sub-block' }

	// Check for fee token transactions (type 0x76)
	// @ts-expect-error - check transaction type field
	if (transaction.type === '0x76' || transaction.type === 118) {
		return { type: 'fee-token', label: 'Fee Token' }
	}

	return { type: 'regular', label: 'Regular' }
}

async function loader({ params }: { params: { id: string } }) {
	try {
		const { id } = params

		let blockRef: BlockIdentifier
		if (isHex(id)) {
			Hex.assert(id)
			blockRef = { kind: 'hash', blockHash: id }
		} else {
			const parsedNumber = Number(id)
			if (!Number.isSafeInteger(parsedNumber)) throw notFound()
			blockRef = { kind: 'number', blockNumber: BigInt(parsedNumber) }
		}

		const wagmiConfig = getConfig()
		const block = await getBlock(wagmiConfig, {
			includeTransactions: true,
			...(blockRef.kind === 'hash'
				? { blockHash: blockRef.blockHash }
				: { blockNumber: blockRef.blockNumber }),
		})

		// Fetch known events for each transaction during SSR
		const knownEventsByHash = await fetchKnownEventsForTransactions(
			block.transactions as BlockTransaction[],
			wagmiConfig,
		)

		return {
			blockRef,
			block: block as BlockWithTransactions,
			knownEventsByHash,
		}
	} catch (error) {
		console.error(error)
		throw notFound({
			routeId: rootRouteId,
			data: {
				error: error instanceof Error ? error.message : 'Invalid block ID',
			},
		})
	}
}

async function fetchKnownEventsForTransactions(
	transactions: BlockTransaction[],
	wagmiConfig: ReturnType<typeof getConfig>,
): Promise<Record<Hex.Hex, KnownEvent[]>> {
	const { getTransactionReceipt } = await import('wagmi/actions')

	const entries = await Promise.all(
		transactions.map(async (transaction) => {
			if (!transaction?.hash)
				return [transaction.hash ?? 'unknown', []] as const

			try {
				const receipt = await getTransactionReceipt(wagmiConfig, {
					hash: transaction.hash,
				})
				const getTokenMetadata = await Tip20.metadataFromLogs(receipt.logs)
				const events = parseKnownEvents(receipt, {
					transaction,
					getTokenMetadata,
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
}

export const Route = createFileRoute('/_layout/block/$id')({
	component: RouteComponent,
	notFoundComponent: NotFound,
	loader,
})

function RouteComponent() {
	const { block, blockRef, knownEventsByHash } = Route.useLoaderData()

	const [chain] = useChains()
	const decimals = chain?.nativeCurrency.decimals ?? 18
	const symbol = chain?.nativeCurrency.symbol ?? 'UNIT'

	const requestedNumber =
		blockRef.kind === 'number' ? blockRef.blockNumber : undefined

	const transactions = React.useMemo(() => {
		if (!block?.transactions) return []
		return block.transactions
	}, [block?.transactions])

	const [latestBlockNumber, setLatestBlockNumber] = React.useState(
		block?.number ?? requestedNumber,
	)

	React.useEffect(() => {
		const blockNumber = block?.number
		if (blockNumber === null || blockNumber === undefined) return
		setLatestBlockNumber((current) => {
			if (!current) return blockNumber
			return current > blockNumber ? current : blockNumber
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
						latestBlockNumber={latestBlockNumber}
						requestedNumber={requestedNumber}
					/>
				</div>
				<div className={cx('min-[1240px]:max-w-full')}>
					<BlockTransactionsCard
						transactions={transactions}
						knownEventsByHash={knownEventsByHash}
						decimals={decimals}
						symbol={symbol}
					/>
				</div>
			</div>
		</section>
	)
}

function BlockSummaryCard(props: BlockSummaryCardProps) {
	const { block, latestBlockNumber, requestedNumber } = props
	const [showAdvanced, setShowAdvanced] = React.useState(true)

	const blockNumberValue = block.number ?? requestedNumber
	const formattedNumber = formatBlockNumber(blockNumberValue)
	const leadingZeros = formattedNumber.match(/^0+/)?.[0] ?? ''
	const trailingDigits = formattedNumber.slice(leadingZeros.length)
	const confirmations =
		block.number && latestBlockNumber && latestBlockNumber >= block.number
			? Number(latestBlockNumber - block.number) + 1
			: undefined
	const utcLabel = block.timestamp
		? DateFormatter.formatUtcTimestamp(block.timestamp)
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
		<article className="divide-y divide-dashed divide-card-border font-mono rounded-[10px] border border-card-border bg-card-header overflow-hidden shadow-[0px_12px_40px_rgba(0,0,0,0.06)]">
			<div className="px-4 py-3">
				<div className="flex items-center justify-between">
					<span className="text-xs uppercase text-tertiary">Block</span>

					<CopyButton
						className="mr-auto pl-2"
						disabled={!blockNumberValue}
						ariaLabel="Copy block number"
						value={blockNumberValue?.toString() ?? ''}
					/>
				</div>
				<div className="mt-[10px] text-2xl leading-[26px] tracking-[0.18em] text-primary tabular-nums">
					<span className="text-[#bbbbbb]">{leadingZeros}</span>
					{trailingDigits || '—'}
				</div>
			</div>

			<div className="divide-y divide-dashed divide-card-border">
				<div>
					<BlockTimeRow label="UTC" value={utcLabel} />
					<BlockTimeRow label="UNIX" value={unixLabel} subtle />
				</div>
				<div className="px-[18px] py-[14px] space-y-[8px]">
					<div className="flex items-center justify-between">
						<span className="text-xs text-tertiary">Hash</span>
						<CopyButton
							value={block.hash ?? ''}
							ariaLabel="Copy block hash"
							className="mr-auto pl-2"
							disabled={!block.hash}
						/>
					</div>
					<div className="text-sm text-primary wrap-break-word">
						{block.hash ?? '—'}
					</div>

					<div className="flex items-center gap-[6px] text-sm justify-between">
						<ArrowUp10Icon className="size-4 text-tertiary" />
						<span className="text-sm text-tertiary text-left mr-auto">
							Parent
						</span>
						<Link
							to="/block/$id"
							params={{ id: block.parentHash }}
							className="text-accent"
							title={block.parentHash}
						>
							{HexFormatter.shortenHex(block.parentHash, 6)}
						</Link>
					</div>
				</div>

				<div className="px-[18px] py-[12px] flex items-center justify-between text-sm">
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

				<div className="px-[18px] py-[12px] flex items-center justify-between text-sm">
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
						<span className="text-sm">Advanced</span>
						<span className="flex items-center gap-[6px] text-primary text-[12px]">
							<ChevronDown
								className={cx(
									'rotate-180 size-[14px] transition-transform duration-300',
									{ 'rotate-0': !showAdvanced },
								)}
							/>
						</span>
					</button>

					{/* TODO: handle this hiding and showing with CSS */}
					{showAdvanced && (
						<div className="mt-[14px] space-y-[14px] text-[13px]">
							<div className="space-y-[6px]">
								<div className="flex items-center justify-between text-primary">
									<span>Gas Usage</span>
									<span className="text-primary">
										{gasUsage !== undefined
											? `${gasUsage.toFixed(2)}%`
											: '0.00%'}
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
								<span className="text-sm">Roots</span>
								{roots.map((root) => (
									<div
										key={root.label}
										className="flex items-center justify-between text-primary text-sm lowercase"
									>
										<span className="text-xs text-tertiary">{root.label}</span>
										<span
											className="tabular-nums flex-1 text-right"
											title={root.value}
										>
											{root.value
												? HexFormatter.shortenHex(root.value, 6)
												: '—'}
										</span>
										<CopyButton
											value={root.value ?? ''}
											ariaLabel="Copy root"
											className="ml-2"
											disabled={!root.value}
										/>
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
	block: BlockWithTransactions
	latestBlockNumber?: bigint
	requestedNumber?: bigint
}

const GAS_DECIMALS = 18

function BlockTransactionsCard(props: BlockTransactionsCardProps) {
	const { transactions, knownEventsByHash, decimals, symbol } = props

	if (transactions.length === 0)
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
				<table className="min-w-full text-[13px] text-primary table-fixed">
					<colgroup>
						<col className="w-[52px]" />
						<col className="w-[100px]" />
						<col className="w-[90px]" />
						<col />
						<col className="w-[110px]" />
						<col className="w-[80px]" />
						<col className="w-[70px]" />
					</colgroup>
					<thead>
						<tr className="border-b border-dashed border-card-border text-tertiary">
							<th className="px-[12px] py-[12px] text-left font-normal whitespace-nowrap">
								#
							</th>
							<th className="px-[12px] py-[12px] text-left font-normal whitespace-nowrap">
								Type
							</th>
							<th className="px-[12px] py-[12px] text-left font-normal whitespace-nowrap">
								From
							</th>
							<th className="px-[12px] py-[12px] text-left font-normal">
								Description
							</th>
							<th className="px-[12px] py-[12px] text-left font-normal whitespace-nowrap">
								Hash
							</th>
							<th className="px-[12px] py-[12px] text-right font-normal whitespace-nowrap">
								Fee
							</th>
							<th className="px-[12px] py-[12px] text-right font-normal whitespace-nowrap">
								Value
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-dashed divide-card-border">
						{transactions.map((transaction, index) => {
							const transactionIndex =
								(transaction.transactionIndex ?? null) !== null
									? Number(transaction.transactionIndex) + 1
									: index + 1

							const fromCell =
								transaction.from === zeroAddress ? (
									<span className="text-tertiary">System</span>
								) : (
									<AddressLink
										address={transaction.from}
										chars={4}
										className="text-accent font-medium text-[12px]"
									/>
								)

							const amountDisplay = formatNativeAmount(
								transaction.value,
								decimals,
								symbol,
							)
							const fee = getEstimatedFee(transaction)
							const feeDisplay =
								fee > 0n ? formatNativeAmount(fee, GAS_DECIMALS, symbol) : '—'
							const feeOutput = feeDisplay === '—' ? '—' : `(${feeDisplay})`
							const hashCell = transaction.hash ? (
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

							const knownEvents = transaction.hash
								? knownEventsByHash[transaction.hash]
								: undefined
							const txType = getTransactionType(transaction)

							return (
								<tr key={transaction.hash} className="bg-card">
									<td className="px-[12px] py-[12px] align-top text-tertiary tabular-nums whitespace-nowrap">
										[{transactionIndex}]
									</td>
									<td className="px-[12px] py-[12px] align-top whitespace-nowrap">
										<div
											className={cx(
												txType.type === 'system'
													? 'text-tertiary'
													: 'text-primary',
												'text-[12px] font-medium',
											)}
										>
											{txType.label}
										</div>
									</td>
									<td className="px-[12px] py-[12px] align-top whitespace-nowrap">
										{fromCell}
									</td>
									<td className="px-[12px] py-[12px] align-top">
										<TransactionDescription
											transaction={transaction}
											amountDisplay={amountDisplay}
											knownEvents={knownEvents}
										/>
									</td>
									<td className="px-[12px] py-[12px] align-top whitespace-nowrap">
										{hashCell}
									</td>
									<td className="px-[12px] py-[12px] align-top text-right text-base-content-secondary whitespace-nowrap">
										{feeOutput}
									</td>
									<td
										className={cx([
											'px-[12px] py-[12px] align-top text-right tabular-nums whitespace-nowrap',
											transaction.value > 0n
												? 'text-base-content-positive'
												: 'text-primary',
										])}
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
	knownEventsByHash: Record<Hex.Hex, KnownEvent[]>
	decimals: number
	symbol: string
}

function TransactionDescription(props: TransactionDescriptionProps) {
	const { transaction, amountDisplay, knownEvents } = props

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

	// Contract creation takes priority - check before known events
	// (contract constructors often emit Transfer events that would otherwise show)
	if (!transaction.to) {
		if (knownEvents && knownEvents.length > 0) {
			// Prioritize "create token" events for contract deployments as they're more descriptive
			const tokenCreationEvent = knownEvents.find(
				(e) => e.type === 'create token',
			)
			const primaryEvent = tokenCreationEvent ?? knownEvents[0]
			const otherEvents = knownEvents.filter((e) => e !== primaryEvent)

			return (
				<div className="inline-flex items-center gap-[8px] text-primary flex-wrap">
					<EventDescription
						event={primaryEvent}
						className="flex flex-row items-center gap-[6px]"
					/>
					{otherEvents.length > 0 && (
						<span className="text-tertiary whitespace-nowrap">
							+{otherEvents.length} more
						</span>
					)}
				</div>
			)
		}
		return <span className="text-primary">Deploy contract</span>
	}

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
}

function BlockTimeRow(props: {
	label: string
	value?: string
	subtle?: boolean
}) {
	const { label, value, subtle } = props
	return (
		<div className="px-[18px] py-[12px] flex items-center justify-between text-sm">
			<span className="text-xs uppercase text-tertiary bg-base-alt/65 px-1 py-0.5">
				{label}
			</span>

			<span
				className={cx(
					'text-right tabular-nums',
					subtle ? 'text-base-content-secondary' : 'text-primary',
				)}
			>
				{value?.replaceAll(',', '')}
			</span>
		</div>
	)
}

function CopyButton(props: {
	value: string
	ariaLabel: string
	disabled?: boolean
	className?: string
}) {
	const { value, ariaLabel, disabled, className } = props
	const { copy, notifying } = useCopy()
	return (
		<button
			type="button"
			onClick={() => copy(value)}
			className={cx(
				'flex items-center gap-[4px] text-tertiary/60 hover:text-primary transition-colors text-[12px]',
				className,
			)}
			aria-label={ariaLabel}
			disabled={disabled}
		>
			<CopyIcon className="size-4" />
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
