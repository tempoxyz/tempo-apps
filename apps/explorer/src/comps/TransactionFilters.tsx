import {
	Button,
	Checkbox,
	SegmentedControl,
	style,
	vars,
} from '@tempoxyz/ds/platform'
import { Filter } from '@tempoxyz/ds/platform/icons'
import * as React from 'react'
import { cx } from 'zyzz'
import { Sections } from './Sections'

type FilterOption<V extends string> = { value: V | undefined; label: string }

type FilterOptions<V extends string> = readonly [
	FilterOption<V>,
	FilterOption<V>,
	FilterOption<V>,
]

const statusOptions: FilterOptions<'success' | 'reverted'> = [
	{ value: 'success', label: 'Successful' },
	{ value: 'reverted', label: 'Failed' },
	{ value: undefined, label: 'All' },
]

const periodOptions: FilterOptions<'24h' | '7d'> = [
	{ value: '24h', label: '24h' },
	{ value: '7d', label: '7d' },
	{ value: undefined, label: 'All' },
]

const directionOptions: FilterOptions<'in' | 'out'> = [
	{ value: undefined, label: 'All' },
	{ value: 'in', label: 'Incoming' },
	{ value: 'out', label: 'Outgoing' },
]

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

	return (
		<TableFilters
			label="Filter transactions"
			activeCount={activeCount}
			onClearAll={handleClearAll}
		>
			{onHideSubmitBatchesChange && (
				<Checkbox
					checked={hideSubmitBatches ?? false}
					onCheckedChange={(checked) => onHideSubmitBatchesChange(checked)}
					label={<span {...styles.checkboxLabel()}>Hide submit batches</span>}
				/>
			)}
			<SegmentedRow
				label="Status"
				options={statusOptions}
				value={status}
				onChange={onStatusChange}
			/>
			<SegmentedRow
				label="Period"
				options={periodOptions}
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
				options={directionOptions}
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
	const triggerRef = React.useRef<HTMLButtonElement>(null)
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
			if (event.key !== 'Escape') return
			setOpen(false)
			triggerRef.current?.focus()
		}
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open, isStacked])

	const trigger = (
		<Button
			ref={triggerRef}
			aria-label={label}
			aria-expanded={open}
			onClick={toggleOpen}
			scale="small"
			variant={activeCount > 0 || open ? 'secondary' : 'tertiary'}
			{...styles.trigger()}
		>
			<Filter />
			Filter
			{activeCount > 0 && (
				<span {...cx(vars({ set: 'inverse' }), styles.count())}>
					{activeCount}
				</span>
			)}
		</Button>
	)

	const clearAll = (
		<Button onClick={onClearAll} scale="small" variant="tertiary">
			Clear all
		</Button>
	)

	if (isStacked) {
		return (
			<div {...styles.stacked()}>
				<div {...styles.stackedHeader()}>
					{trigger}
					{open && activeCount > 0 && clearAll}
				</div>
				{open && <div {...styles.stackedBody()}>{children}</div>}
			</div>
		)
	}

	return (
		<div ref={containerRef} {...styles.anchor()}>
			{trigger}
			{open && (
				<div {...styles.popover()}>
					<div {...styles.popoverBody()}>{children}</div>
					{activeCount > 0 && <div {...styles.popoverFooter()}>{clearAll}</div>}
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
	options: FilterOptions<V>
	value: V | undefined
	onChange: (value: V | undefined) => void
}): React.JSX.Element {
	const { label, options, value, onChange } = props
	const labelId = React.useId()
	// SegmentedControl values are strings, so "no filter" is `all`.
	const toItem = (option: FilterOption<V>) => ({
		label: option.label,
		value: option.value ?? ('all' as const),
	})
	const items = [
		toItem(options[0]),
		toItem(options[1]),
		toItem(options[2]),
	] as const

	return (
		<div {...styles.segmentedRow()}>
			<span id={labelId} {...styles.segmentedLabel()}>
				{label}
			</span>
			<SegmentedControl
				aria-labelledby={labelId}
				items={items}
				value={value ?? 'all'}
				onValueChange={(next) => onChange(next === 'all' ? undefined : next)}
				style={{ width: '100%' }}
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
	// TDS Checkbox colours its label black, which disappears in dark mode.
	export const checkboxLabel = style({ color: 'content.primary' })

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
		gap: '16',
		paddingTop: '8',
	})

	export const trigger = style({
		selectors: {
			'& > svg': { flexShrink: '0 !custom', height: '16', width: '16' },
		},
	})

	export const count = style({
		alignItems: 'center',
		backgroundColor: 'background.primary',
		borderRadius: 'full',
		color: 'content.primary',
		display: 'inline-flex',
		height: '16',
		justifyContent: 'center',
		minWidth: '16',
		paddingInline: '4',
		typography: 'body.b3Strong',
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
		width: '296px !custom',
		zIndex: 50,
	})

	export const popoverBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		padding: '16',
	})

	export const popoverFooter = style({
		borderTopColor: 'line.secondary',
		borderTopStyle: 'solid',
		borderTopWidth: 'regular',
		paddingBlock: '8',
		paddingInline: '8',
	})

	export const segmentedRow = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const segmentedLabel = style({
		color: 'content.secondary',
		typography: 'body.b3',
	})
}
