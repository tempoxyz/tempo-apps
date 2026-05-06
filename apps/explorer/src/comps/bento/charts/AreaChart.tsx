import * as React from 'react'
import { cx } from '#lib/css'
import { buildAreaPath, buildSmoothPath, scaleLinear } from './chart-utils'

export function AreaChart(props: AreaChart.Props): React.JSX.Element {
	const {
		values,
		height = 120,
		width = 320,
		className,
		ariaLabel,
		renderTooltip,
		baselines = [],
		yDomain,
	} = props

	const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)
	const gradientId = React.useId()

	const { linePath, areaPath, points, min, max } = React.useMemo(() => {
		if (values.length === 0)
			return {
				linePath: '',
				areaPath: '',
				points: [] as Array<{ x: number; y: number }>,
				min: 0,
				max: 0,
			}
		const minV = yDomain?.[0] ?? Math.min(...values)
		const maxV = yDomain?.[1] ?? Math.max(...values)
		const pad = 4
		const pts = values.map((v, i) => ({
			x: scaleLinear(i, 0, values.length - 1, pad, width - pad),
			y: scaleLinear(v, minV, maxV, height - pad, pad),
		}))
		return {
			linePath: buildSmoothPath(pts),
			areaPath: buildAreaPath(pts, height - pad),
			points: pts,
			min: minV,
			max: maxV,
		}
	}, [values, height, width, yDomain])

	function handleMove(evt: React.PointerEvent<SVGSVGElement>) {
		if (values.length === 0 || !svgRef.current) return
		const rect = svgRef.current.getBoundingClientRect()
		const x = ((evt.clientX - rect.left) / rect.width) * width
		const idx = Math.min(
			values.length - 1,
			Math.max(0, Math.round((x / width) * (values.length - 1))),
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
					ariaLabel ??
					`area chart, ${values.length} points, range ${min.toFixed(2)}–${max.toFixed(2)}`
				}
				onPointerMove={handleMove}
				onPointerLeave={() => setHoverIdx(null)}
			>
				<defs>
					<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
						<stop
							offset="0%"
							stopColor="var(--color-accent)"
							stopOpacity="0.32"
						/>
						<stop
							offset="100%"
							stopColor="var(--color-accent)"
							stopOpacity="0"
						/>
					</linearGradient>
				</defs>
				{baselines.map((b) => {
					const y = scaleLinear(b.value, min, max, height - 4, 4)
					return (
						<g key={b.label}>
							<line
								x1={0}
								x2={width}
								y1={y}
								y2={y}
								stroke="var(--color-border-primary)"
								strokeDasharray="2 3"
								strokeWidth={1}
								vectorEffect="non-scaling-stroke"
							/>
						</g>
					)
				})}
				{areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
				{linePath ? (
					<path
						d={linePath}
						stroke="var(--color-accent)"
						strokeWidth={1.5}
						fill="none"
						strokeLinecap="round"
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
				) : null}
				{hoverIdx != null && points[hoverIdx] ? (
					<>
						<line
							x1={points[hoverIdx].x}
							x2={points[hoverIdx].x}
							y1={0}
							y2={height}
							stroke="var(--color-accent)"
							strokeOpacity={0.25}
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
						<circle
							cx={points[hoverIdx].x}
							cy={points[hoverIdx].y}
							r={3.5}
							fill="var(--color-card)"
							stroke="var(--color-accent)"
							strokeWidth={1.5}
							vectorEffect="non-scaling-stroke"
						/>
					</>
				) : null}
			</svg>
			{hoverIdx != null && renderTooltip ? (
				<div
					className="pointer-events-none absolute top-1 left-1 rounded-md border border-card-border bg-card px-2 py-1 text-[11px] text-primary shadow-sm"
					style={{}}
				>
					{renderTooltip(hoverIdx)}
				</div>
			) : null}
		</div>
	)
}

export declare namespace AreaChart {
	type Props = {
		values: number[]
		height?: number
		width?: number
		className?: string
		ariaLabel?: string
		renderTooltip?: (index: number) => React.ReactNode
		baselines?: Array<{ label: string; value: number }>
		yDomain?: [number, number]
	}
}
