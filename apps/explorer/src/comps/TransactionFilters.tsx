import { style, vars } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { cx } from 'zyzz'
import { Choices } from '#comps/ui/Choices'
import { transitionColors } from '#styles/explorer'
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
		<label {...styles.batchFilter()}>
			<input
				type="checkbox"
				checked={hideSubmitBatches ?? false}
				onChange={(event) => onHideSubmitBatchesChange(event.target.checked)}
				{...styles.checkbox()}
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
			<div {...styles.stacked()}>
				<div {...styles.stackedHeader()}>
					<button
						type="button"
						onClick={toggleOpen}
						aria-label={label}
						aria-expanded={open}
						{...cx(
							styles.toggle(),
							transitionColors(),
							activeCount > 0 && styles.toggleActive(),
						)}
					>
						<ListFilterIcon {...styles.toggleIcon()} />
						{activeCount > 0 && (
							<span {...styles.toggleCount()}>{activeCount}</span>
						)}
					</button>
					{open && activeCount > 0 && (
						<button
							type="button"
							onClick={onClearAll}
							{...cx(styles.clearAll(), transitionColors())}
						>
							Clear all
						</button>
					)}
				</div>
				{open && <div {...styles.stackedBody()}>{children}</div>}
			</div>
		)
	}

	return (
		<div ref={containerRef} {...styles.anchor()}>
			<button
				type="button"
				onClick={toggleOpen}
				aria-label={label}
				aria-expanded={open}
				{...cx(
					styles.toggle(),
					transitionColors(),
					activeCount > 0 && styles.toggleActive(),
				)}
			>
				<ListFilterIcon {...styles.toggleIcon()} />
				{activeCount > 0 && (
					<span {...styles.toggleCount()}>{activeCount}</span>
				)}
			</button>

			{open && (
				<div {...styles.popover()}>
					<div {...styles.popoverBody()}>{children}</div>
					{activeCount > 0 && (
						<div {...styles.popoverFooter()}>
							<button
								type="button"
								onClick={onClearAll}
								{...cx(styles.clearAll(), transitionColors())}
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
		<div {...styles.segmentedRow()}>
			<span {...styles.segmentedLabel()}>{label}</span>
			<Choices
				{...styles.segmented()}
				label={label}
				value={String(options.findIndex((option) => option.value === value))}
				items={options.map((option, index) => ({
					value: String(index),
					label: option.label,
				}))}
				scale="small"
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

namespace styles {
	export const batchFilter = style({
		alignItems: 'center',
		color: 'content.secondary',
		cursor: 'pointer',
		display: 'flex',
		gap: '8',
		typography: 'body.b3',
	})

	export const checkbox = style({
		accentColor: 'component.button.primary.fill',
	})

	export const stacked = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const stackedHeader = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
	})

	export const stackedBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		paddingTop: '8',
	})

	export const toggle = style({
		alignItems: 'center',
		borderColor: 'transparent !custom',
		borderRadius: '2xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		color: 'content.tertiary',
		cursor: 'pointer',
		display: 'flex',
		gap: '8',
		paddingBlock: '4',
		paddingInline: '8',
		typography: 'body.b3',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'container.regular',
				color: 'content.secondary',
			},
		},
	})

	export const toggleActive = style({
		backgroundColor: 'container.subtle',
		borderColor: 'line.primary',
		color: 'content.primary',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'container.subtle',
				color: 'content.primary',
			},
		},
	})

	export const toggleIcon = style({
		height: '14px !custom',
		width: '14px !custom',
	})

	export const toggleCount = style({
		alignItems: 'center',
		backgroundColor: 'component.button.primary.fill',
		borderRadius: '3xs',
		color: 'background.secondary',
		display: 'flex',
		height: '16',
		justifyContent: 'center',
		minWidth: '16',
		paddingInline: '4',
		typography: 'body.b3Strong',
	})

	export const clearAll = style({
		color: 'content.tertiary',
		cursor: 'pointer',
		typography: 'body.b3',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
	})

	export const anchor = style({
		alignItems: 'center',
		display: 'flex',
		position: 'relative',
	})

	export const popover = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		boxShadow: `0 1px 2px ${vars.color.shadow.secondary}, 0 8px 24px ${vars.color.shadow.primary} !custom`,
		marginTop: '8',
		maxWidth: 'calc(100vw - 32px) !custom',
		position: 'absolute',
		right: '0px !custom',
		top: '100% !custom',
		width: '280px !custom',
		zIndex: 50,
	})

	export const popoverBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
		padding: '16',
	})

	export const popoverFooter = style({
		borderTopColor: 'line.secondary',
		borderTopStyle: 'solid',
		borderTopWidth: 'regular',
		paddingBlock: '12',
		paddingInline: '16',
	})

	export const segmentedRow = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const segmentedLabel = style({
		color: 'content.tertiary',
		flexShrink: '0 !custom',
		typography: 'body.b3',
	})

	export const segmented = style({
		minWidth: '0 !custom',
		width: '100% !custom',
	})
}
