import * as React from 'react'
import { cx } from '#lib/css'
import { Sections } from './Sections'
import ListFilterIcon from '~icons/lucide/list-filter'

type FilterSection<V extends string> = {
	label: string
	options: { value: V | undefined; label: string }[]
}

const statusSection: FilterSection<'success' | 'reverted'> = {
	label: 'Status',
	options: [
		{ value: 'success', label: 'Successful' },
		{ value: 'reverted', label: 'Failed' },
		{ value: undefined, label: 'All' },
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

export function TransactionFilters(
	props: TransactionFilters.Props,
): React.JSX.Element {
	const { status, period, onStatusChange, onPeriodChange } = props

	const mode = Sections.useSectionsMode()
	const isStacked = mode === 'stacked'

	const [open, setOpen] = React.useState(false)
	const containerRef = React.useRef<HTMLDivElement>(null)

	const activeCount =
		(status !== undefined ? 1 : 0) + (period !== undefined ? 1 : 0)

	const handleClearAll = React.useCallback(() => {
		onStatusChange(undefined)
		onPeriodChange(undefined)
	}, [onStatusChange, onPeriodChange])

	const toggleOpen = React.useCallback(() => setOpen((v) => !v), [])

	React.useEffect(() => {
		if (!open || isStacked) return
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
	}, [open, isStacked])

	if (isStacked) {
		return (
			<div className="flex flex-col gap-[10px]">
				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={toggleOpen}
						className={cx(
							'flex items-center gap-[6px] border rounded-[6px] px-[8px] py-[4px] text-[12px] cursor-pointer transition-colors',
							activeCount > 0
								? 'border-accent/20 text-accent bg-accent/5'
								: 'border-transparent text-tertiary hover:text-secondary hover:bg-base-alt',
						)}
					>
						<ListFilterIcon className="w-[14px] h-[14px]" />
						{activeCount > 0 && (
							<span className="flex items-center justify-center min-w-[16px] h-[16px] rounded-[4px] bg-accent text-[10px] font-bold text-base-background px-[4px]">
								{activeCount}
							</span>
						)}
					</button>
					{open && activeCount > 0 && (
						<button
							type="button"
							onClick={handleClearAll}
							className="text-[11px] text-tertiary hover:text-accent cursor-pointer transition-colors"
						>
							Clear all
						</button>
					)}
				</div>
				{open && (
					<div className="flex flex-col gap-[10px] pt-[6px]">
						<SegmentedRow
							label={statusSection.label}
							options={statusSection.options}
							value={status}
							onChange={onStatusChange}
						/>
						<SegmentedRow
							label={periodSection.label}
							options={periodSection.options}
							value={period}
							onChange={onPeriodChange}
						/>
					</div>
				)}
			</div>
		)
	}

	return (
		<div ref={containerRef} className="relative flex items-center">
			<button
				type="button"
				onClick={toggleOpen}
				className={cx(
					'flex items-center gap-[6px] border rounded-[6px] px-[8px] py-[4px] text-[12px] cursor-pointer transition-colors',
					activeCount > 0
						? 'border-accent/20 text-accent bg-accent/5'
						: 'border-transparent text-tertiary hover:text-secondary hover:bg-base-alt',
				)}
			>
				<ListFilterIcon className="w-[14px] h-[14px]" />
				{activeCount > 0 && (
					<span className="flex items-center justify-center min-w-[16px] h-[16px] rounded-[4px] bg-accent text-[10px] font-bold text-base-background px-[4px]">
						{activeCount}
					</span>
				)}
			</button>

			{open && (
				<div className="absolute top-full right-0 mt-[6px] z-50 bg-card-header border border-card-border rounded-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] min-w-[260px]">
					<div className="flex flex-col gap-[10px] p-[14px]">
						<SegmentedRow
							label={statusSection.label}
							options={statusSection.options}
							value={status}
							onChange={onStatusChange}
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

export declare namespace TransactionFilters {
	type Props = {
		status?: 'success' | 'reverted' | undefined
		period?: '24h' | '7d' | undefined
		onStatusChange: (status: 'success' | 'reverted' | undefined) => void
		onPeriodChange: (period: '24h' | '7d' | undefined) => void
	}
}
