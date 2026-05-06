import * as React from 'react'
import { cx } from '#lib/css'

export type StackedSeries = {
	key: string
	label: string
	/** Numeric totals per day (same length as `dates`). */
	values: number[]
	color: string
}

export function StackedBarTimeChart(
	props: StackedBarTimeChart.Props,
): React.JSX.Element {
	const {
		dates,
		series,
		height = 140,
		width = 560,
		className,
		ariaLabel,
		formatValue,
		formatDate = (d) => new Date(d * 1000).toLocaleDateString(),
	} = props

	const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)

	const totals = React.useMemo(() => {
		const len = dates.length
		const out = new Array<number>(len).fill(0)
		for (const s of series) {
			for (let i = 0; i < len; i++) out[i] += s.values[i] ?? 0
		}
		return out
	}, [dates.length, series])

	const max = Math.max(1, ...totals)

	const gap = dates.length > 14 ? 1.5 : 3
	const barWidth = Math.max(
		1,
		(width - gap * (dates.length - 1)) / Math.max(1, dates.length),
	)

	function handleMove(evt: React.PointerEvent<SVGSVGElement>) {
		if (!dates.length || !svgRef.current) return
		const rect = svgRef.current.getBoundingClientRect()
		const x = ((evt.clientX - rect.left) / rect.width) * width
		const idx = Math.min(
			dates.length - 1,
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
				aria-label={ariaLabel ?? `stacked bar chart, ${dates.length} bars`}
				onPointerMove={handleMove}
				onPointerLeave={() => setHoverIdx(null)}
			>
				{dates.map((_, i) => {
					const x = i * (barWidth + gap)
					let offset = 0
					return series.map((s) => {
						const v = s.values[i] ?? 0
						const h = max > 0 ? (v / max) * (height - 2) : 0
						const y = height - offset - h
						offset += h
						const active = hoverIdx === i
						return (
							<rect
								key={`${i}-${s.key}`}
								x={x}
								y={y}
								width={barWidth}
								height={Math.max(h, v > 0 ? 0.5 : 0)}
								fill={s.color}
								fillOpacity={active ? 1 : 0.88}
							/>
						)
					})
				})}
			</svg>
			{hoverIdx != null ? (
				<div className="pointer-events-none absolute top-1 left-1 min-w-[160px] rounded-md border border-card-border bg-card px-2 py-1.5 text-[11px] shadow-sm">
					<div className="text-tertiary mb-1">
						{formatDate(dates[hoverIdx])}
					</div>
					<ul className="flex flex-col gap-[2px]">
						{[...series]
							.map((s) => ({
								key: s.key,
								label: s.label,
								color: s.color,
								v: s.values[hoverIdx] ?? 0,
							}))
							.sort((a, b) => b.v - a.v)
							.slice(0, 6)
							.map((s) => (
								<li
									key={s.key}
									className="flex items-center justify-between gap-2"
								>
									<span className="flex items-center gap-1.5 truncate">
										<span
											className="size-[6px] rounded-full shrink-0"
											style={{ backgroundColor: s.color }}
										/>
										<span className="text-primary truncate">{s.label}</span>
									</span>
									<span className="font-mono text-primary tabular-nums text-[10.5px]">
										{formatValue ? formatValue(s.v) : s.v.toFixed(0)}
									</span>
								</li>
							))}
					</ul>
				</div>
			) : null}
		</div>
	)
}

export declare namespace StackedBarTimeChart {
	type Props = {
		dates: number[]
		series: StackedSeries[]
		height?: number
		width?: number
		className?: string
		ariaLabel?: string
		formatValue?: (v: number) => string
		formatDate?: (unixSeconds: number) => string
	}
}
