import * as React from 'react'
import { cx } from '#lib/css'
import { buildAreaPath, buildSmoothPath, scaleLinear } from './chart-utils'

export function Sparkline(props: Sparkline.Props): React.JSX.Element {
	const {
		values,
		height = 48,
		width = 160,
		className,
		fill = true,
		strokeWidth = 1.25,
		ariaLabel,
		onHoverIndex,
	} = props

	const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)

	const { linePath, areaPath, points, min, max } = React.useMemo(() => {
		if (values.length === 0)
			return {
				linePath: '',
				areaPath: '',
				points: [] as Array<{ x: number; y: number }>,
				min: 0,
				max: 0,
			}
		const minV = Math.min(...values)
		const maxV = Math.max(...values)
		const pad = 2
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
	}, [values, height, width])

	const gradientId = React.useId()

	function handleMove(evt: React.PointerEvent<SVGSVGElement>) {
		if (values.length === 0 || !svgRef.current) return
		const rect = svgRef.current.getBoundingClientRect()
		const x = ((evt.clientX - rect.left) / rect.width) * width
		const idx = Math.min(
			values.length - 1,
			Math.max(0, Math.round((x / width) * (values.length - 1))),
		)
		setHoverIdx(idx)
		onHoverIndex?.(idx)
	}

	function handleLeave() {
		setHoverIdx(null)
		onHoverIndex?.(null)
	}

	return (
		<svg
			ref={svgRef}
			viewBox={`0 0 ${width} ${height}`}
			preserveAspectRatio="none"
			className={cx('block h-full w-full touch-none', className)}
			role="img"
			aria-label={
				ariaLabel ?? `sparkline from ${min.toFixed(2)} to ${max.toFixed(2)}`
			}
			onPointerMove={handleMove}
			onPointerLeave={handleLeave}
		>
			<defs>
				<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
					<stop
						offset="0%"
						stopColor="var(--color-accent)"
						stopOpacity="0.28"
					/>
					<stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
				</linearGradient>
			</defs>
			{fill && areaPath ? (
				<path d={areaPath} fill={`url(#${gradientId})`} />
			) : null}
			{linePath ? (
				<path
					d={linePath}
					stroke="var(--color-accent)"
					strokeWidth={strokeWidth}
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
						r={3}
						fill="var(--color-card)"
						stroke="var(--color-accent)"
						strokeWidth={1.5}
						vectorEffect="non-scaling-stroke"
					/>
				</>
			) : null}
		</svg>
	)
}

export declare namespace Sparkline {
	type Props = {
		values: number[]
		height?: number
		width?: number
		className?: string
		fill?: boolean
		strokeWidth?: number
		ariaLabel?: string
		onHoverIndex?: (idx: number | null) => void
	}
}
