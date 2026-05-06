export type Point = { x: number; y: number }

export function buildLinePath(points: Point[]): string {
	if (points.length === 0) return ''
	const [first, ...rest] = points
	let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`
	for (const p of rest) {
		d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
	}
	return d
}

/**
 * Build a smooth catmull-rom-ish path. Keeps a natural curve without needing
 * an extra dependency.
 */
export function buildSmoothPath(points: Point[]): string {
	if (points.length < 2) return buildLinePath(points)
	const tension = 0.5
	let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] ?? points[i]
		const p1 = points[i]
		const p2 = points[i + 1]
		const p3 = points[i + 2] ?? p2
		const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension
		const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension
		const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension
		const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension
		d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
	}
	return d
}

export function buildAreaPath(points: Point[], baseY: number): string {
	if (points.length === 0) return ''
	const line = buildSmoothPath(points)
	const first = points[0]
	const last = points[points.length - 1]
	return `${line} L ${last.x.toFixed(2)} ${baseY} L ${first.x.toFixed(2)} ${baseY} Z`
}

export function scaleLinear(
	value: number,
	domainMin: number,
	domainMax: number,
	rangeMin: number,
	rangeMax: number,
): number {
	if (domainMax === domainMin) return (rangeMin + rangeMax) / 2
	const t = (value - domainMin) / (domainMax - domainMin)
	return rangeMin + t * (rangeMax - rangeMin)
}

export function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0
	const idx = Math.min(
		sorted.length - 1,
		Math.max(0, Math.floor((p / 100) * sorted.length)),
	)
	return sorted[idx]
}
