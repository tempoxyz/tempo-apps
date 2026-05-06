import * as React from 'react'
import { cx } from '#lib/css'

export function BarChart(props: BarChart.Props): React.JSX.Element {
	const {
		values,
		height = 80,
		width = 280,
		className,
		ariaLabel,
		renderTooltip,
		max: maxOverride,
		showBaseline = false,
		gradient = false,
	} = props

	const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)

	const max = maxOverride ?? (values.length ? Math.max(...values, 1) : 1)
	const gap = values.length > 40 ? 1 : values.length > 20 ? 1.5 : 2
	const barWidth = Math.max(
		1,
		(width - gap * (values.length - 1)) / Math.max(1, values.length),
	)

	function handleMove(evt: React.PointerEvent<SVGSVGElement>) {
		if (values.length === 0 || !svgRef.current) return
		const rect = svgRef.current.getBoundingClientRect()
		const x = ((evt.clientX - rect.left) / rect.width) * width
		const idx = Math.min(
			values.length - 1,
			Math.max(0, Math.floor(x / (barWidth + gap))),
		)
		setHoverIdx(idx)
	}

	return (
		<div className={cx('relative h-full w-full', className)}>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${width} ${height}`}
				preserveAspectRatio="none"
				className="block h-full w-full touch-none"
				role="img"
				aria-label={
					ariaLabel ?? `bar chart, ${values.length} bars, max ${max.toFixed(2)}`
				}
				onPointerMove={handleMove}
				onPointerLeave={() => setHoverIdx(null)}
			>
				{showBaseline ? (
					<line
						x1={0}
						x2={width}
						y1={height - 0.5}
						y2={height - 0.5}
						stroke="var(--color-border-primary)"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				) : null}
				{values.map((v, i) => {
					const h = max > 0 ? (v / max) * (height - 2) : 0
					const x = i * (barWidth + gap)
					const y = height - h
					const active = hoverIdx === i
					// Bar opacity ramps from `0.2` at the leftmost (oldest) sample
					// up to `1.0` at the rightmost (newest) sample when gradient
					// mode is enabled. Hover always pops to full saturation.
					const baseOpacity =
						gradient && values.length > 1
							? 0.2 + (i / (values.length - 1)) * 0.8
							: 0.85
					return (
						<rect
							key={i}
							x={x}
							y={y}
							width={barWidth}
							height={Math.max(h, v > 0 ? 0.5 : 0)}
							rx={Math.min(1.5, barWidth / 3)}
							fill="var(--color-accent)"
							fillOpacity={active ? 1 : baseOpacity}
						/>
					)
				})}
			</svg>
			{hoverIdx != null && renderTooltip ? (
				<div className="pointer-events-none absolute top-1 left-1 rounded-md border border-card-border bg-card px-2 py-1 text-[11px] text-primary shadow-sm">
					{renderTooltip(hoverIdx)}
				</div>
			) : null}
		</div>
	)
}

export declare namespace BarChart {
	type Props = {
		values: number[]
		height?: number
		width?: number
		className?: string
		ariaLabel?: string
		renderTooltip?: (index: number) => React.ReactNode
		max?: number
		showBaseline?: boolean
		gradient?: boolean
	}
}

export function StackedBarChart(
	props: StackedBarChart.Props,
): React.JSX.Element {
	const {
		series,
		totals,
		height = 80,
		width = 280,
		className,
		ariaLabel,
		renderTooltip,
	} = props

	const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)

	const length = series[0]?.length ?? 0
	const max = totals ? Math.max(...totals, 1) : 1
	const gap = length > 40 ? 1 : 1.5
	const barWidth = Math.max(
		1,
		(width - gap * (length - 1)) / Math.max(1, length),
	)

	function handleMove(evt: React.PointerEvent<SVGSVGElement>) {
		if (length === 0 || !svgRef.current) return
		const rect = svgRef.current.getBoundingClientRect()
		const x = ((evt.clientX - rect.left) / rect.width) * width
		const idx = Math.min(
			length - 1,
			Math.max(0, Math.floor(x / (barWidth + gap))),
		)
		setHoverIdx(idx)
	}

	return (
		<div className={cx('relative h-full w-full', className)}>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${width} ${height}`}
				preserveAspectRatio="none"
				className="block h-full w-full touch-none"
				role="img"
				aria-label={ariaLabel ?? `stacked bar chart, ${length} bars`}
				onPointerMove={handleMove}
				onPointerLeave={() => setHoverIdx(null)}
			>
				{Array.from({ length }).map((_, i) => {
					const x = i * (barWidth + gap)
					let offset = 0
					return series.map((serie, sIdx) => {
						const v = serie[i] ?? 0
						const h = max > 0 ? (v / max) * (height - 2) : 0
						const y = height - offset - h
						offset += h
						const active = hoverIdx === i
						return (
							<rect
								key={`${i}-${sIdx}`}
								x={x}
								y={y}
								width={barWidth}
								height={Math.max(h, v > 0 ? 0.5 : 0)}
								fill={
									sIdx === 0
										? 'var(--color-accent)'
										: 'var(--color-border-primary)'
								}
								fillOpacity={
									sIdx === 0 ? (active ? 1 : 0.85) : active ? 0.7 : 0.5
								}
							/>
						)
					})
				})}
			</svg>
			{hoverIdx != null && renderTooltip ? (
				<div className="pointer-events-none absolute top-1 left-1 rounded-md border border-card-border bg-card px-2 py-1 text-[11px] text-primary shadow-sm">
					{renderTooltip(hoverIdx)}
				</div>
			) : null}
		</div>
	)
}

export declare namespace StackedBarChart {
	type Props = {
		/** Series from bottom to top. */
		series: number[][]
		/** Pre-computed per-bar totals for scaling; overrides sum(series). */
		totals?: number[]
		height?: number
		width?: number
		className?: string
		ariaLabel?: string
		renderTooltip?: (index: number) => React.ReactNode
	}
}
