import type * as React from 'react'

const stateColors: Record<string, string> = {
	idle: 'var(--color-text-tertiary)',
	registering: 'var(--color-accent)',
	deriving: 'var(--color-virtual-magic)',
	sending: 'var(--color-accent)',
	resolving: 'var(--color-positive)',
	complete: 'var(--color-positive)',
}

export function StatusBadge(props: StatusBadge.Props): React.JSX.Element {
	const { state } = props
	const color = stateColors[state] ?? 'var(--color-text-tertiary)'

	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 6,
				fontSize: 11,
				fontWeight: 600,
				letterSpacing: '0.06em',
				textTransform: 'uppercase',
				color,
			}}
		>
			<span
				style={{
					width: 6,
					height: 6,
					borderRadius: '50%',
					background: color,
					boxShadow: state !== 'idle' ? `0 0 6px ${color}` : 'none',
				}}
			/>
			{state}
		</span>
	)
}

export declare namespace StatusBadge {
	type Props = { state: string }
}
