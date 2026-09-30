import { Choices } from 'regen-ui'
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
	const {
		status,
		period,
		onStatusChange,
		onPeriodChange,
		hideSubmitBatches,
		onHideSubmitBatchesChange,
		onClearAll,
	} = props

	const activeCount =
		(status !== undefined ? 1 : 0) +
		(period !== undefined ? 1 : 0) +
		(hideSubmitBatches ? 1 : 0)

	const handleClearAll = React.useCallback(() => {
		if (onClearAll) return onClearAll()
		onStatusChange(undefined)
		onPeriodChange(undefined)
		onHideSubmitBatchesChange?.(false)
	}, [onStatusChange, onPeriodChange, onHideSubmitBatchesChange, onClearAll])

	const batchFilter = onHideSubmitBatchesChange && (
		<label className="flex items-center gap-[8px] label-12 text-secondary cursor-pointer">
			<input
				type="checkbox"
				checked={hideSubmitBatches ?? false}
				onChange={(event) => onHideSubmitBatchesChange(event.target.checked)}
				className="accent-accent"
			/>
			Hide submit batches
		</label>
	)

	return (
		<TableFilters
			label="Filter transactions"
			activeCount={activeCount}
			onClearAll={handleClearAll}
		>
			{batchFilter}
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
		</TableFilters>
	)
}

export function TransferFilters(
	props: TransferFilters.Props,
): React.JSX.Element {
	const { direction, onDirectionChange } = props
	return (
		<TableFilters
			label="Filter transfers"
			activeCount={direction ? 1 : 0}
			onClearAll={() => onDirectionChange(undefined)}
		>
			<SegmentedRow
				label="Direction"
				options={[
					{ value: undefined, label: 'All' },
					{ value: 'in', label: 'Incoming' },
					{ value: 'out', label: 'Outgoing' },
				]}
				value={direction}
				onChange={onDirectionChange}
			/>
		</TableFilters>
	)
}

export declare namespace TransferFilters {
	type Props = {
		direction?: 'in' | 'out' | undefined
		onDirectionChange: (direction: 'in' | 'out' | undefined) => void
	}
}

export function TableFilters(props: TableFilters.Props): React.JSX.Element {
	const { label, activeCount, onClearAll, children } = props
	const mode = Sections.useSectionsMode()
	const isStacked = mode === 'stacked'
	const [open, setOpen] = React.useState(false)
	const containerRef = React.useRef<HTMLDivElement>(null)
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
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open, isStacked])

	if (isStacked) {
		return (
			<div className="flex flex-col gap-[10px]">
				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={toggleOpen}
						aria-label={label}
						aria-expanded={open}
						className={cx(
							'flex items-center gap-[6px] border rounded-body px-[8px] py-[4px] label-12 cursor-pointer transition-colors',
							activeCount > 0
								? 'border-accent/20 text-accent bg-accent/5'
								: 'border-transparent text-tertiary hover:text-secondary hover:bg-base-alt',
						)}
					>
						<ListFilterIcon className="w-[14px] h-[14px]" />
						{activeCount > 0 && (
							<span className="flex items-center justify-center min-w-[16px] h-[16px] rounded-[4px] bg-accent label-12 font-semibold text-base-background px-[4px]">
								{activeCount}
							</span>
						)}
					</button>
					{open && activeCount > 0 && (
						<button
							type="button"
							onClick={onClearAll}
							className="label-12 text-tertiary hover:text-accent cursor-pointer transition-colors"
						>
							Clear all
						</button>
					)}
				</div>
				{open && (
					<div className="flex flex-col gap-[10px] pt-[6px]">{children}</div>
				)}
			</div>
		)
	}

	return (
		<div ref={containerRef} className="relative flex items-center">
			<button
				type="button"
				onClick={toggleOpen}
				aria-label={label}
				aria-expanded={open}
				className={cx(
					'flex items-center gap-[6px] border rounded-body px-[8px] py-[4px] label-12 cursor-pointer transition-colors',
					activeCount > 0
						? 'border-accent/20 text-accent bg-accent/5'
						: 'border-transparent text-tertiary hover:text-secondary hover:bg-base-alt',
				)}
			>
				<ListFilterIcon className="w-[14px] h-[14px]" />
				{activeCount > 0 && (
					<span className="flex items-center justify-center min-w-[16px] h-[16px] rounded-[4px] bg-accent label-12 font-semibold text-base-background px-[4px]">
						{activeCount}
					</span>
				)}
			</button>

			{open && (
				<div className="absolute top-full right-0 mt-[6px] z-50 bg-card-header border border-card-border rounded-body shadow-lg w-[280px] max-w-[calc(100vw-32px)]">
					<div className="flex flex-col gap-[10px] p-[14px]">{children}</div>
					{activeCount > 0 && (
						<div className="border-t border-card-border px-[14px] py-[10px]">
							<button
								type="button"
								onClick={onClearAll}
								className="label-12 text-tertiary hover:text-accent cursor-pointer transition-colors"
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

export declare namespace TableFilters {
	type Props = {
		label: string
		activeCount: number
		onClearAll: () => void
		children: React.ReactNode
	}
}

function SegmentedRow<V extends string>(props: {
	label: string
	options: { value: V | undefined; label: string }[]
	value: V | undefined
	onChange: (value: V | undefined) => void
}): React.JSX.Element {
	const { label, options, value, onChange } = props
	return (
		<div className="flex flex-col gap-[6px]">
			<span className="label-12 text-tertiary shrink-0">{label}</span>
			<Choices
				className="w-full min-w-0 [&_[role=radio]]:px-1.5"
				label={label}
				value={String(options.findIndex((option) => option.value === value))}
				items={options.map((option, index) => ({
					value: String(index),
					label: option.label,
				}))}
				variant="compact"
				onChange={(next) => onChange(options[Number(next)].value)}
			/>
		</div>
	)
}

export declare namespace TransactionFilters {
	type Props = {
		status?: 'success' | 'reverted' | undefined
		period?: '24h' | '7d' | undefined
		hideSubmitBatches?: boolean | undefined
		onHideSubmitBatchesChange?: ((hide: boolean) => void) | undefined
		onClearAll?: (() => void) | undefined
		onStatusChange: (status: 'success' | 'reverted' | undefined) => void
		onPeriodChange: (period: '24h' | '7d' | undefined) => void
	}
}
