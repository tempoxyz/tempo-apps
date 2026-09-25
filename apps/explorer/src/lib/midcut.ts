/** Fit a middle ellipsis by removing whole characters, never parts of glyphs. */
export function fitMidcut(
	value: string,
	options: {
		width: number
		measure: (text: string) => number
		prefix: string
		ellipsis: string
		min: number
	},
): { start: string; end: string; cut: boolean } {
	const prefix = value.startsWith(options.prefix) ? options.prefix : ''
	const body = value.slice(prefix.length)
	const minimum = Math.max(1, options.min) * 2
	if (options.measure(value) <= options.width || body.length <= minimum)
		return { start: value, end: '', cut: false }

	const parts = (count: number) => ({
		start: prefix + body.slice(0, Math.ceil(count / 2)),
		end: body.slice(-Math.floor(count / 2)),
		cut: true,
	})
	let low = minimum
	let high = body.length - 1
	const ellipsisWidth = options.measure(options.ellipsis)
	while (low < high) {
		const count = Math.ceil((low + high) / 2)
		const { start, end } = parts(count)
		const width = options.measure(start) + ellipsisWidth + options.measure(end)
		if (width <= options.width) low = count
		else high = count - 1
	}
	return parts(low)
}
