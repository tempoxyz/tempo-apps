import * as React from 'react'
import { cx } from '#lib/css'
import { Sections } from './Sections'
import ListFilterIcon from '~icons/lucide/list-filter'
import XIcon from '~icons/lucide/x'

type FilterSection<V extends string> = {
	label: string
	options: { value: V | undefined; label: string }[]
}

const statusSection: FilterSection<'success' | 'reverted'> = {
	label: 'Status',
	options: [
		{ value: undefined, label: 'All' },
		{ value: 'success', label: 'Successful' },
		{ value: 'reverted', label: 'Failed' },
	],
}

const directionSection: FilterSection<'sent' | 'received'> = {
	label: 'Direction',
	options: [
		{ value: undefined, label: 'All' },
		{ value: 'sent', label: 'Sent' },
		{ value: 'received', label: 'Received' },
	],
}

const periodSection: FilterSection<'24h' | '7d'> = {
	label: 'Period',
	options: [
		{ value: '24h', label: '24h' },
		{ value: '7d', label: '7d' },
		{ value: undefined, label: 'All' },
	],
}

function chipLabel(
	_key: 'status' | 'direction' | 'period',
	value: string,
): string {
	const map: Record<string, string> = {
		success: 'Successful',
		reverted: 'Failed',
		sent: 'Sent',
		received: 'Received',
		'24h': '24h',
		'7d': '7d',
	}
	return map[value] ?? value
}

export function TransactionFilters(
	props: TransactionFilters.Props,
): React.JSX.Element {
	const {
		status,
		direction,
		period,
		onStatusChange,
		onDirectionChange,
		onPeriodChange,
	} = props

	const mode = Sections.useSectionsMode()
	const isStacked = mode === 'stacked'

	const [open, setOpen] = React.useState(false)
	const containerRef = React.useRef<HTMLDivElement>(null)

	const activeCount =
		(status !== undefined ? 1 : 0) +
		(direction !== undefined ? 1 : 0) +
		(period !== undefined ? 1 : 0)

	const activeChips = React.useMemo(() => {
		const chips: {
			key: 'status' | 'direction' | 'period'
			label: string
			onClear: () => void
		}[] = []
		if (status !== undefined)
			chips.push({
				key: 'status',
				label: chipLabel('status', status),
				onClear: () => onStatusChange(undefined),
			})
		if (direction !== undefined)
			chips.push({
				key: 'direction',
				label: chipLabel('direction', direction),
				onClear: () => onDirectionChange(undefined),
			})
		if (period !== undefined)
			chips.push({
				key: 'period',
				label: chipLabel('period', period),
				onClear: () => onPeriodChange(undefined),
			})
		return chips
	}, [
		status,
		direction,
		period,
		onStatusChange,
		onDirectionChange,
		onPeriodChange,
	])

	const handleClearAll = React.useCallback(() => {
		onStatusChange(undefined)
		onDirectionChange(undefined)
		onPeriodChange(undefined)
	}, [onStatusChange, onDirectionChange, onPeriodChange])

	const toggleOpen = React.useCallback(() => setOpen((v) => !v), [])
	const close = React.useCallback(() => setOpen(false), [])

	React.useEffect(() => {
		if (!open) return
		function onPointerDown(e: PointerEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false)
			}
		}
		document.addEventListener('pointerdown', onPointerDown)
		return () => document.removeEventListener('pointerdown', onPointerDown)
	}, [open])

	return (
		<div ref={containerRef} className="relative flex items-center gap-[6px]">
			{activeChips.map((chip) => (
				<button
					key={chip.key}
					type="button"
					onClick={chip.onClear}
					className="flex items-center gap-[4px] px-[8px] py-[3px] rounded-[5px] text-[11px] bg-distinct border border-card-border text-secondary cursor-pointer hover:text-primary transition-colors"
				>
					{chip.label}
					<XIcon className="w-[10px] h-[10px]" />
				</button>
			))}

			<button
				type="button"
				onClick={toggleOpen}
				className={cx(
					'flex items-center gap-[6px] border rounded-[6px] px-[10px] py-[4px] text-[12px] cursor-pointer transition-colors',
					activeCount > 0
						? 'border-accent/20 text-accent bg-accent/5'
						: 'border-transparent text-tertiary hover:text-secondary hover:bg-base-alt',
				)}
			>
				<ListFilterIcon className="w-[14px] h-[14px]" />
				{!isStacked && <span>Filter</span>}
				{activeCount > 0 && (
					<span className="flex items-center justify-center min-w-[16px] h-[16px] rounded-[4px] bg-accent text-[10px] font-bold text-base-background px-[4px]">
						{activeCount}
					</span>
				)}
			</button>

			{open && !isStacked && (
				<div className="absolute top-full right-0 mt-[6px] z-50 bg-card-header border border-card-border rounded-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] min-w-[260px]">
					<div className="flex flex-col gap-[10px] p-[14px]">
						<SegmentedRow
							label={statusSection.label}
							options={statusSection.options}
							value={status}
							onChange={onStatusChange}
						/>
						<SegmentedRow
							label={directionSection.label}
							options={directionSection.options}
							value={direction}
							onChange={onDirectionChange}
						/>
						<SegmentedRow
							label={periodSection.label}
							options={periodSection.options}
							value={period}
							onChange={onPeriodChange}
						/>
					</div>
					{activeCount > 0 && (
						<div className="border-t border-card-border px-[14px] py-[10px]">
							<button
								type="button"
								onClick={handleClearAll}
								className="text-[11px] text-tertiary hover:text-accent cursor-pointer transition-colors"
							>
								Clear all
							</button>
						</div>
					)}
				</div>
			)}

			{open && isStacked && (
				<>
					<div
						className="fixed inset-0 z-40"
						onPointerDown={close}
						role="presentation"
					/>
					<div className="fixed inset-x-0 bottom-0 z-50 bg-card-header border-t border-card-border rounded-t-[16px]">
						<div className="flex justify-center pt-[10px] pb-[4px]">
							<div className="w-[36px] h-[4px] rounded-full bg-card-border" />
						</div>
						<div className="px-[18px] pb-[6px]">
							<h2 className="text-[14px] font-medium text-primary">
								Filter transactions
							</h2>
						</div>
						<div className="flex flex-col gap-[16px] px-[18px] py-[12px]">
							<SheetSection
								label={statusSection.label}
								options={statusSection.options}
								value={status}
								onChange={onStatusChange}
							/>
							<SheetSection
								label={directionSection.label}
								options={directionSection.options}
								value={direction}
								onChange={onDirectionChange}
							/>
							<SheetSection
								label={periodSection.label}
								options={periodSection.options}
								value={period}
								onChange={onPeriodChange}
							/>
						</div>
						<div className="flex items-center gap-[10px] px-[18px] py-[14px] border-t border-card-border">
							{activeCount > 0 && (
								<button
									type="button"
									onClick={handleClearAll}
									className="flex-1 text-[13px] text-tertiary hover:text-accent cursor-pointer transition-colors text-center py-[8px]"
								>
									Clear all
								</button>
							)}
							<button
								type="button"
								onClick={close}
								className={cx(
									'text-[13px] font-medium text-accent cursor-pointer transition-colors text-center py-[8px] rounded-[8px] bg-accent/10',
									activeCount > 0 ? 'flex-1' : 'w-full',
								)}
							>
								Apply
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	)
}

function SegmentedRow<V extends string>(props: {
	label: string
	options: { value: V | undefined; label: string }[]
	value: V | undefined
	onChange: (value: V | undefined) => void
}): React.JSX.Element {
	const { label, options, value, onChange } = props
	return (
		<div className="flex items-center justify-between gap-[10px]">
			<span className="text-[11px] text-tertiary shrink-0">{label}</span>
			<div className="flex items-center gap-0.5 text-[12px]">
				{options.map((option) => (
					<button
						key={option.label}
						type="button"
						onClick={() => onChange(option.value)}
						className={cx(
							'px-2 py-0.5 rounded-[4px] cursor-pointer transition-colors',
							value === option.value
								? 'bg-distinct text-primary'
								: 'text-tertiary hover:text-secondary',
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	)
}

function SheetSection<V extends string>(props: {
	label: string
	options: { value: V | undefined; label: string }[]
	value: V | undefined
	onChange: (value: V | undefined) => void
}): React.JSX.Element {
	const { label, options, value, onChange } = props
	return (
		<div className="flex flex-col gap-[8px]">
			<span className="text-[11px] text-tertiary">{label}</span>
			<div className="flex items-center gap-[6px] flex-wrap">
				{options.map((option) => (
					<button
						key={option.label}
						type="button"
						onClick={() => onChange(option.value)}
						className={cx(
							'px-[14px] py-[6px] rounded-[8px] border text-[13px] cursor-pointer transition-colors',
							value === option.value
								? 'bg-accent/10 border-accent/30 text-accent'
								: 'border-card-border text-tertiary hover:text-secondary',
						)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	)
}

export declare namespace TransactionFilters {
	type Props = {
		status?: 'success' | 'reverted' | undefined
		direction?: 'sent' | 'received' | undefined
		period?: '24h' | '7d' | undefined
		onStatusChange: (status: 'success' | 'reverted' | undefined) => void
		onDirectionChange: (direction: 'sent' | 'received' | undefined) => void
		onPeriodChange: (period: '24h' | '7d' | undefined) => void
	}
}
