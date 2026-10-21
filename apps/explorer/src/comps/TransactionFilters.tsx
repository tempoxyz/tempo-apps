import {
	Button,
	Checkbox,
	ChoiceGroup,
	Field,
	Popover,
	style,
} from '@tempoxyz/ds'
import { Filter } from '@tempoxyz/ds/icons'
import type * as React from 'react'

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

	const handleClearAll = () => {
		if (onClearAll) return onClearAll()
		onStatusChange(undefined)
		onPeriodChange(undefined)
		onHideSubmitBatchesChange?.(false)
	}

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
			<FilterChoice
				label="Status"
				options={statusOptions}
				value={status}
				onChange={onStatusChange}
			/>
			<FilterChoice
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
			<FilterChoice
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

/** A Filter button that opens the filters in a TDS `Popover`. */
function TableFilters(props: TableFiltersProps): React.JSX.Element {
	const { activeCount, children, label, onClearAll } = props
	return (
		<Popover.Root>
			<Popover.Trigger
				render={
					<Button
						aria-label={label}
						size="small"
						variant={activeCount > 0 ? 'secondary' : 'text'}
					/>
				}
			>
				<Filter {...styles.icon()} />
				Filter
				{activeCount > 0 && <span {...styles.count()}>{activeCount}</span>}
			</Popover.Trigger>
			<Popover.Popup align="end">
				<Popover.Title>{label}</Popover.Title>
				<div {...styles.fields()}>{children}</div>
				<div {...styles.actions()}>
					{activeCount > 0 && (
						<Button onClick={onClearAll} size="small" variant="secondary">
							Clear filters
						</Button>
					)}
					<Popover.Close render={<Button size="small" variant="text" />}>
						Done
					</Popover.Close>
				</div>
			</Popover.Popup>
		</Popover.Root>
	)
}

type TableFiltersProps = {
	label: string
	activeCount: number
	onClearAll: () => void
	children: React.ReactNode
}

/** One filter: a labelled TDS `ChoiceGroup`. */
function FilterChoice<V extends string>(
	props: FilterChoiceProps<V>,
): React.JSX.Element {
	const { label, onChange, options, value } = props
	return (
		<Field.Root>
			<Field.Label>{label}</Field.Label>
			{/* ChoiceGroup values are strings, so "no filter" is `all`. */}
			<ChoiceGroup.Root<V | 'all'>
				onValueChange={(next) => onChange(next === 'all' ? undefined : next)}
				size="small"
				value={value ?? 'all'}
			>
				{options.map((option) => (
					<ChoiceGroup.Item
						key={option.value ?? 'all'}
						value={option.value ?? 'all'}
					>
						{option.label}
					</ChoiceGroup.Item>
				))}
			</ChoiceGroup.Root>
		</Field.Root>
	)
}

type FilterChoiceProps<V extends string> = {
	label: string
	options: FilterOptions<V>
	value: V | undefined
	onChange: (value: V | undefined) => void
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
	export const icon = style({ flexShrink: '0 !custom', fontSize: '16' })

	// Inverted pill: the page background on the foreground color.
	export const count = style({
		alignItems: 'center',
		backgroundColor: 'foreground',
		borderRadius: 'full',
		color: 'background.primary',
		display: 'inline-flex',
		height: '16',
		justifyContent: 'center',
		minWidth: '16',
		paddingInline: '4',
		typography: 'label.12.strong',
	})

	export const fields = style({
		display: 'flex',
		flexDirection: 'column',
		gap: '16',
		marginTop: '16',
	})

	export const actions = style({
		display: 'flex',
		gap: '8',
		justifyContent: 'flex-end',
		marginTop: '24',
	})
}
