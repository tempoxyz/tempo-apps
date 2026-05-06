import * as React from 'react'
import { cx } from '#lib/css'

export function Donut(props: Donut.Props): React.JSX.Element {
	const {
		segments,
		size = 120,
		thickness = 12,
		gap = 2,
		className,
		ariaLabel,
		children,
	} = props

	const radius = size / 2 - thickness / 2 - 2
	const circumference = 2 * Math.PI * radius
	const total = segments.reduce((acc, s) => acc + s.value, 0) || 1

	const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)

	let offset = 0

	return (
		<div
			className={cx(
				'relative inline-flex items-center justify-center',
				className,
			)}
			style={{ width: size, height: size }}
		>
			<svg
				viewBox={`0 0 ${size} ${size}`}
				width={size}
				height={size}
				role="img"
				aria-label={ariaLabel ?? 'donut chart'}
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke="var(--color-border-tertiary)"
					strokeWidth={thickness}
					fill="none"
				/>
				{segments.map((s, i) => {
					const length = (s.value / total) * circumference
					const dash = `${Math.max(0, length - gap)} ${circumference}`
					const rotation = ((offset / circumference) * 360 - 90).toFixed(2)
					offset += length
					const active = hoverIdx === i
					return (
						<circle
							key={s.label}
							cx={size / 2}
							cy={size / 2}
							r={radius}
							stroke={s.color ?? 'var(--color-accent)'}
							strokeWidth={thickness}
							fill="none"
							strokeDasharray={dash}
							strokeDashoffset={0}
							strokeLinecap="butt"
							transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
							style={{
								opacity: active ? 1 : hoverIdx == null ? 1 : 0.5,
								transition: 'opacity 150ms ease',
								cursor: 'pointer',
							}}
							onPointerEnter={() => setHoverIdx(i)}
							onPointerLeave={() => setHoverIdx(null)}
						>
							<title>
								{s.label}: {s.value}
							</title>
						</circle>
					)
				})}
			</svg>
			<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
				{children}
			</div>
		</div>
	)
}

export declare namespace Donut {
	type Segment = {
		label: string
		value: number
		color?: string
	}

	type Props = {
		segments: Segment[]
		size?: number
		thickness?: number
		gap?: number
		className?: string
		ariaLabel?: string
		children?: React.ReactNode
	}
}
