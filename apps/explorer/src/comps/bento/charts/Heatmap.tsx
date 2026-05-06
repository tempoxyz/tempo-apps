import * as React from 'react'
import { cx } from '#lib/css'

/**
 * GitHub-style contribution heatmap. Values are laid out column-major — each
 * column index `c` is one bucket in the X axis, each row index `r` is one
 * bucket in the Y axis. Cell size is derived from the container's available
 * width/height so the grid fills the tile without the cells stretching to a
 * fixed pixel size.
 */
export function Heatmap(props: Heatmap.Props): React.JSX.Element {
	const {
		columns,
		rows,
		getValue,
		getLabel,
		max,
		className,
		ariaLabel,
		minCellSize = 6,
		maxCellSize = Number.POSITIVE_INFINITY,
	} = props

	const containerRef = React.useRef<HTMLDivElement>(null)
	const [box, setBox] = React.useState<{ w: number; h: number } | null>(null)
	const [hover, setHover] = React.useState<{
		col: number
		row: number
		x: number
		y: number
	} | null>(null)

	React.useEffect(() => {
		const node = containerRef.current
		if (!node) return
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const rect = entry.contentRect
				setBox({ w: rect.width, h: rect.height })
			}
		})
		ro.observe(node)
		return () => ro.disconnect()
	}, [])

	const computedMax = React.useMemo(() => {
		if (max != null) return max
		let m = 0
		for (let c = 0; c < columns; c++) {
			for (let r = 0; r < rows; r++) {
				const v = getValue(c, r)
				if (v > m) m = v
			}
		}
		return Math.max(1, m)
	}, [columns, rows, getValue, max])

	const layout = React.useMemo(() => {
		if (!box || box.w <= 0 || box.h <= 0) return null
		// Target cell to gap ratio ~ 4:1 for a tight GitHub feel.
		const ratio = 0.2
		const cellByWidth = box.w / (columns + (columns - 1) * ratio)
		const cellByHeight = box.h / (rows + (rows - 1) * ratio)
		const raw = Math.min(cellByWidth, cellByHeight)
		const cellSize = Math.max(minCellSize, Math.min(maxCellSize, raw))
		const cellGap = Math.max(2, cellSize * ratio)
		const innerW = columns * cellSize + (columns - 1) * cellGap
		const innerH = rows * cellSize + (rows - 1) * cellGap
		return { cellSize, cellGap, innerW, innerH }
	}, [box, columns, rows, minCellSize, maxCellSize])

	function handlePointer(
		evt: React.PointerEvent<SVGRectElement>,
		c: number,
		r: number,
	) {
		const rect = (
			containerRef.current as HTMLDivElement
		).getBoundingClientRect()
		setHover({
			col: c,
			row: r,
			x: evt.clientX - rect.left,
			y: evt.clientY - rect.top,
		})
	}

	return (
		<div
			ref={containerRef}
			className={cx(
				'relative h-full w-full flex items-center justify-center overflow-hidden',
				className,
			)}
		>
			{layout ? (
				<svg
					width={layout.innerW}
					height={layout.innerH}
					viewBox={`0 0 ${layout.innerW} ${layout.innerH}`}
					preserveAspectRatio="xMidYMid meet"
					className="block shrink-0"
					role="img"
					aria-label={ariaLabel ?? `activity heatmap ${columns}x${rows}`}
				>
					{Array.from({ length: columns }).map((_, c) =>
						Array.from({ length: rows }).map((_, r) => {
							const v = getValue(c, r)
							const opacity =
								v <= 0 ? 0 : Math.min(1, 0.12 + (v / computedMax) * 0.88)
							const x = c * (layout.cellSize + layout.cellGap)
							const y = r * (layout.cellSize + layout.cellGap)
							const active = hover?.col === c && hover?.row === r
							return (
								<rect
									key={`${c}-${r}`}
									x={x}
									y={y}
									width={layout.cellSize}
									height={layout.cellSize}
									rx={Math.max(1, layout.cellSize * 0.18)}
									fill={
										v <= 0
											? 'var(--color-border-tertiary)'
											: 'var(--color-accent)'
									}
									fillOpacity={v <= 0 ? 1 : opacity}
									stroke={active ? 'var(--color-accent)' : 'none'}
									strokeWidth={active ? 1 : 0}
									vectorEffect="non-scaling-stroke"
									onPointerEnter={(e) => handlePointer(e, c, r)}
									onPointerLeave={() => setHover(null)}
								/>
							)
						}),
					)}
				</svg>
			) : null}
			{hover && getLabel ? (
				<div
					className="pointer-events-none absolute z-10 rounded-md border border-card-border bg-card px-2 py-1 text-[10.5px] text-primary shadow-[0_4px_16px_-8px_rgba(0,0,0,0.18)] whitespace-nowrap"
					style={{
						left: Math.min(hover.x + 10, (box?.w ?? 0) - 140),
						top: Math.max(0, hover.y - 24),
					}}
				>
					{getLabel(hover.col, hover.row, getValue(hover.col, hover.row))}
				</div>
			) : null}
		</div>
	)
}

export declare namespace Heatmap {
	type Props = {
		columns: number
		rows: number
		getValue: (col: number, row: number) => number
		getLabel?: (col: number, row: number, value: number) => string
		max?: number
		className?: string
		ariaLabel?: string
		minCellSize?: number
		maxCellSize?: number
	}
}
