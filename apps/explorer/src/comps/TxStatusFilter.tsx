import type * as React from 'react'
import { cx } from '#lib/css'

type StatusValue = 'all' | 'success' | 'reverted'

const options: { value: StatusValue; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'success', label: 'Success' },
	{ value: 'reverted', label: 'Failed' },
]

export function TxStatusFilter(props: TxStatusFilter.Props): React.JSX.Element {
	const { value = 'all', onChange } = props

	return (
		<div className="flex items-center gap-0.5 text-[12px]">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() =>
						onChange(option.value === 'all' ? undefined : option.value)
					}
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
	)
}

export declare namespace TxStatusFilter {
	type Props = {
		value?: 'success' | 'reverted' | undefined
		onChange: (status: 'success' | 'reverted' | undefined) => void
	}
}
