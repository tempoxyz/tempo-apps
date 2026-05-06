import type * as React from 'react'
import { cx } from '#lib/css'

export function Stat(props: Stat.Props): React.JSX.Element {
	const { label, value, sub, tone = 'default', className } = props
	return (
		<div className={cx('flex flex-col gap-0.5', className)}>
			{label ? (
				<span className="text-[10.5px] uppercase tracking-[0.06em] text-tertiary">
					{label}
				</span>
			) : null}
			<span
				className={cx(
					'font-mono text-[18px] leading-[1.05] tracking-[-0.02em] tabular-nums',
					tone === 'positive' && 'text-positive',
					tone === 'negative' && 'text-negative',
					tone === 'default' && 'text-primary',
				)}
			>
				{value}
			</span>
			{sub ? <span className="text-[11px] text-secondary">{sub}</span> : null}
		</div>
	)
}

export declare namespace Stat {
	type Props = {
		label?: React.ReactNode
		value: React.ReactNode
		sub?: React.ReactNode
		tone?: 'default' | 'positive' | 'negative'
		className?: string
	}
}
