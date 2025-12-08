import { Link } from '@tanstack/react-router'
import type { Hex } from 'ox'
import * as React from 'react'
import { useWatchBlockNumber } from 'wagmi'
import { InfoCard } from '#comps/InfoCard'
import { TruncatedHash } from '#comps/TruncatedHash'
import { cx } from '#cva.config'
import { DateFormatter } from '#lib/formatting'
import { useCopy } from '#lib/hooks'
import type { BlockWithTransactions } from '#lib/queries'
import ArrowUp10 from '~icons/lucide/arrow-up-1-0'
import ChevronDown from '~icons/lucide/chevron-down'
import CopyIcon from '~icons/lucide/copy'

export function BlockCard(props: BlockCard.Props) {
	const { block } = props
	const {
		number: blockNumber,
		hash,
		timestamp,
		parentHash,
		miner,
		gasUsed,
		gasLimit,
		stateRoot,
		transactionsRoot,
		receiptsRoot,
		withdrawalsRoot,
	} = block

	const [showAdvanced, setShowAdvanced] = React.useState(false)

	const copyBlock = useCopy()
	const copyHash = useCopy()

	const confirmationsRef = React.useRef<HTMLSpanElement>(null)
	const latestBlockRef = React.useRef(blockNumber ?? 0n)

	const getConfirmations = (latest?: bigint) => {
		if (!blockNumber || !latest || latest < blockNumber) return undefined
		return Number(latest - blockNumber) + 1
	}

	useWatchBlockNumber({
		onBlockNumber: (newBlockNumber) => {
			if (newBlockNumber > (latestBlockRef.current ?? 0n)) {
				latestBlockRef.current = newBlockNumber
				const confirmations = getConfirmations(newBlockNumber)
				if (confirmationsRef.current) {
					confirmationsRef.current.textContent =
						confirmations !== undefined ? String(confirmations) : '—'
				}
			}
		},
	})

	const utcFormatted = timestamp
		? DateFormatter.formatUtcTimestamp(timestamp)
		: undefined
	const [utcDate, utcTime] = utcFormatted?.split(', ') ?? []

	const gasUsage = BlockCard.getGasUsagePercent(gasUsed, gasLimit)
	const roots = [
		{ label: 'state', value: stateRoot },
		{ label: 'txns', value: transactionsRoot },
		{ label: 'receipts', value: receiptsRoot },
		{ label: 'withdraws', value: withdrawalsRoot },
	]

	const showAdvancedSection = true

	return (
		<InfoCard
			titlePosition="inside"
			className="text-[13px]"
			title={
				<button
					type="button"
					onClick={() => copyBlock.copy(String(blockNumber ?? 0n))}
					className="w-full text-left cursor-pointer press-down text-tertiary pb-[4px]"
					title={String(blockNumber ?? 0n)}
				>
					<div className="flex items-center gap-[8px] mb-[4px]">
						<span className="uppercase">Block</span>
						<div className="relative flex items-center">
							<CopyIcon className="w-[12px] h-[12px] text-content-dimmed" />
							{copyBlock.notifying && (
								<span className="absolute left-[calc(100%+8px)] leading-[16px]">
									copied
								</span>
							)}
						</div>
					</div>
					<BlockCard.BlockNumber value={blockNumber ?? 0n} />
				</button>
			}
			sections={[
				<div key="time" className="w-full flex flex-col gap-[8px]">
					<BlockCard.TimeRow
						label="UTC"
						value={
							<time dateTime={new Date(Number(timestamp) * 1000).toISOString()}>
								<span className="text-primary">{utcDate}</span>
								{utcTime && <> {utcTime}</>}
							</time>
						}
					/>
					<BlockCard.TimeRow label="UNIX" value={String(timestamp)} />
				</div>,
				<div key="hash-parent" className="w-full flex flex-col gap-[8px]">
					{hash && (
						<button
							type="button"
							onClick={() => copyHash.copy(hash)}
							className="w-full text-left cursor-pointer press-down text-tertiary"
							title={hash}
						>
							<div className="flex items-center gap-[8px] mb-[8px]">
								<span className="font-normal capitalize">Hash</span>
								<div className="relative flex items-center">
									<CopyIcon className="w-[12px] h-[12px] text-content-dimmed" />
									{copyHash.notifying && (
										<span className="absolute left-[calc(100%+8px)] leading-[16px]">
											copied
										</span>
									)}
								</div>
							</div>
							<div className="text-[14px] font-normal leading-[18px] tracking-[1px] text-primary break-all max-w-[calc(22ch+22px)]">
								{hash}
							</div>
						</button>
					)}
					<div className="w-full flex items-center justify-between gap-[8px]">
						<span className="flex items-center gap-[6px] font-normal capitalize text-tertiary">
							<ArrowUp10 className="size-[14px] text-content-dimmed" />
							Parent
						</span>
						<Link
							to="/block/$id"
							params={{ id: parentHash }}
							className="text-accent hover:underline press-down"
							title={parentHash}
						>
							<TruncatedHash hash={parentHash} minChars={4} />
						</Link>
					</div>
				</div>,
				<div
					key="miner-confirmations"
					className="w-full flex flex-col gap-[8px]"
				>
					<BlockCard.InfoRow label="Miner">
						{miner ? (
							<Link
								to="/address/$address"
								params={{ address: miner }}
								className="text-accent hover:underline press-down"
								title={miner}
							>
								<TruncatedHash hash={miner} minChars={4} />
							</Link>
						) : (
							<span className="text-tertiary">—</span>
						)}
					</BlockCard.InfoRow>
					<BlockCard.InfoRow label="Confirmations">
						<span ref={confirmationsRef} className="text-primary">
							<span className="text-secondary">—</span>
						</span>
					</BlockCard.InfoRow>
				</div>,
				showAdvancedSection && (
					<div
						key="advanced"
						className="w-[calc(100%+36px)] -mx-[18px] -my-[12px] px-[18px] py-[12px]"
					>
						<button
							type="button"
							className="flex w-full items-center justify-between text-tertiary cursor-pointer press-down"
							onClick={() => setShowAdvanced((prev) => !prev)}
						>
							<span className="text-[14px]">Advanced</span>
							<ChevronDown
								className={cx('size-[14px] text-content-dimmed', {
									'rotate-180': showAdvanced,
								})}
							/>
						</button>

						{showAdvanced && (
							<div className="mt-[14px] space-y-[14px]">
								<div className="space-y-[6px]">
									<div className="flex items-center justify-between text-primary">
										<span>Gas Usage</span>
										<span className="text-primary">
											{gasUsage !== undefined
												? `${gasUsage.toFixed(2)}%`
												: '0.00%'}
										</span>
									</div>
									<div className="flex items-center h-[2px] px-[1px] bg-card-border">
										<div
											className="h-full bg-accent"
											style={{
												width: `max(4px, ${Math.min(100, gasUsage ?? 0)}%)`,
											}}
										/>
									</div>
									<div className="flex items-center justify-between text-tertiary">
										<BlockCard.GasValue value={gasUsed} />
										<BlockCard.GasValue value={gasLimit} highlight={false} />
									</div>
								</div>

								<div className="space-y-[8px]">
									<div>Roots</div>
									{roots.map((root) => (
										<BlockCard.RootRow
											key={root.label}
											label={root.label}
											hash={root.value}
										/>
									))}
								</div>
							</div>
						)}
					</div>
				),
			]}
		/>
	)
}

export namespace BlockCard {
	export interface Props {
		block: BlockWithTransactions
	}

	export function TimeRow(props: TimeRow.Props) {
		const { label, value } = props
		return (
			<div className="w-full flex items-center justify-between">
				<span className="text-[11px] uppercase text-tertiary bg-base-alt/65 px-[4px] py-[2px]">
					{label}
				</span>
				<span className="text-right text-base-content-secondary">{value}</span>
			</div>
		)
	}

	export namespace TimeRow {
		export interface Props {
			label: string
			value?: React.ReactNode
		}
	}

	export function BlockNumber(props: BlockNumber.Props) {
		const { value } = props
		const str = String(value).padStart(14, '0')
		const zerosEnd = str.match(/^0*/)?.[0].length ?? 0
		return (
			// the 14px font size is used to set the same width as the block hash
			<div className="text-[14px] max-w-[calc(22ch+22px)]">
				<span className="flex justify-between gap-[1px] text-[22px] text-tertiary">
					{str.split('').map((char, index) => (
						<span
							key={`${index}-${char}`}
							className={index >= zerosEnd ? 'text-primary' : undefined}
						>
							{char}
						</span>
					))}
				</span>
			</div>
		)
	}

	export namespace BlockNumber {
		export interface Props {
			value: bigint
		}
	}

	export function InfoRow(props: InfoRow.Props) {
		const { label, children } = props
		return (
			<div className="w-full flex items-center justify-between gap-[8px]">
				<span className="font-normal capitalize text-tertiary">{label}</span>
				{children}
			</div>
		)
	}

	export namespace InfoRow {
		export interface Props {
			label: string
			children: React.ReactNode
		}
	}

	export function GasValue(props: GasValue.Props) {
		const { value, digits = 9, highlight = true } = props
		if (value === undefined) return <span>—</span>
		const str = String(value).padStart(digits, '0')
		const zeros = str.match(/^0*/)?.[0] ?? ''
		const number = str.slice(zeros.length)
		return (
			<span>
				{zeros}
				{highlight ? <span className="text-primary">{number}</span> : number}
			</span>
		)
	}

	export namespace GasValue {
		export interface Props {
			value?: bigint
			digits?: number
			highlight?: boolean
		}
	}

	export function RootRow(props: RootRow.Props) {
		const { label, hash } = props
		const { copy, notifying } = useCopy()

		if (!hash) {
			return (
				<div className="flex items-center justify-between gap-[8px] text-primary lowercase">
					<span className="text-[12px] text-tertiary">{label}</span>
					<span className="text-tertiary">—</span>
				</div>
			)
		}

		return (
			<button
				type="button"
				onClick={() => copy(hash)}
				className="w-full flex items-center justify-between gap-[8px] text-primary lowercase cursor-pointer press-down"
				title={hash}
			>
				<span className="text-[12px] text-tertiary">
					{notifying ? 'copied' : label}
				</span>
				<div className="flex items-center gap-[8px]">
					<TruncatedHash hash={hash} minChars={4} />
					<CopyIcon className="w-[12px] h-[12px] text-content-dimmed" />
				</div>
			</button>
		)
	}

	export namespace RootRow {
		export interface Props {
			label: string
			hash?: Hex.Hex
		}
	}

	export function getGasUsagePercent(gasUsed?: bigint, gasLimit?: bigint) {
		if (!gasUsed || !gasLimit) return undefined
		const used = Number(gasUsed)
		const limit = Number(gasLimit)
		if (!limit) return undefined
		return (used / limit) * 100
	}
}
