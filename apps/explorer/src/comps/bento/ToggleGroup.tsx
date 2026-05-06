import type * as React from 'react'
import { cx } from '#lib/css'

export function ToggleGroup<T extends string>(
	props: ToggleGroup.Props<T>,
): React.JSX.Element {
	return (
		<div className="flex items-center rounded-full border border-card-border bg-base-alt p-[2px] text-[11px]">
			{props.options.map((opt) => (
				<button
					key={opt.value}
					type="button"
					onClick={() => props.onChange(opt.value)}
					className={cx(
						'rounded-full px-2 py-[2px] font-medium transition-colors press-down-mini',
						props.value === opt.value
							? 'bg-card text-primary shadow-sm'
							: 'text-tertiary hover:text-secondary',
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	)
}

export declare namespace ToggleGroup {
	type Props<T extends string> = {
		options: Array<{ value: T; label: string }>
		value: T
		onChange: (next: T) => void
	}
}
