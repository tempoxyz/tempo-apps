import { Button, Checkbox, ChoiceGroup, Field, style } from '@tempoxyz/ds'
import { Filter } from '@tempoxyz/ds/icons'
import * as React from 'react'
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
				<Field.Root>
					<Field.Item>
						<Checkbox
							checked={hideSubmitBatches ?? false}
							onCheckedChange={(checked) => onHideSubmitBatchesChange(checked)}
						/>
						<Field.Label>Hide submit batches</Field.Label>
					</Field.Item>
				</Field.Root>
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
			size="small"
			variant={activeCount > 0 || open ? 'secondary' : 'text'}
		>
			<Filter {...styles.icon()} />
			Filter
			{activeCount > 0 && <span {...styles.count()}>{activeCount}</span>}
		</Button>
	)

	const clearAll = (
		<Button onClick={onClearAll} size="small" variant="text">
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

	return (
		<div {...styles.segmentedRow()}>
			<span id={labelId} {...styles.segmentedLabel()}>
				{label}
			</span>
			{/* ChoiceGroup values are strings, so "no filter" is `all`. */}
			<ChoiceGroup.Root<V | 'all'>
				aria-labelledby={labelId}
				onValueChange={(next) => onChange(next === 'all' ? undefined : next)}
				size="small"
				value={value ?? 'all'}
				{...styles.choiceGroup()}
			>
				{options.map((option) => (
					<ChoiceGroup.Item
						key={option.value ?? 'all'}
						value={option.value ?? 'all'}
						{...styles.choice()}
					>
						{option.label}
					</ChoiceGroup.Item>
				))}
			</ChoiceGroup.Root>
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
	export const stacked = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
	})

	export const stackedHeader = style({
		alignItems: 'center',
		display: 'flex',
		justifyContent: 'space-between',
	})

	export const stackedBody = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '4',
		paddingTop: '2',
	})

	export const icon = style({ flexShrink: '0 !custom', fontSize: 'base' })

	// Inverted pill: the page background on the foreground color.
	export const count = style({
		alignItems: 'center',
		backgroundColor: 'foreground',
		borderRadius: 'full',
		color: 'background.primary',
		display: 'inline-flex',
		height: '4',
		justifyContent: 'center',
		minWidth: '4',
		paddingInline: '1',
		typography: 'label.12.strong',
	})

	export const anchor = style({
		alignItems: 'center',
		display: 'flex',
		position: 'relative',
	})

	export const popover = style({
		backgroundColor: 'background.surface',
		borderColor: 'grayAlpha.200',
		borderRadius: 'xl',
		borderStyle: 'solid',
		borderWidth: '1px',
		boxShadow: 'popover',
		marginTop: '2',
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
		gap: '4',
		padding: '4',
	})

	export const popoverFooter = style({
		borderTopColor: 'grayAlpha.200',
		borderTopStyle: 'solid',
		borderTopWidth: '1px',
		paddingBlock: '2',
		paddingInline: '2',
	})

	export const segmentedRow = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '2',
	})

	export const segmentedLabel = style({
		color: 'gray.900',
		typography: 'label.12',
	})

	// The choices share the popover width, as the segmented control did.
	export const choiceGroup = style({ width: '100% !custom' })

	export const choice = style({ flexGrow: '1 !custom' })
}
