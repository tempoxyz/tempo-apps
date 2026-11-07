import { Hex } from 'ox'
import * as z from 'zod/mini'

const transformationsSchema = z.array(
	z.object({
		type: z.enum(['replace', 'insert']),
		reason: z.enum(['immutable', 'library', 'callProtection']),
		offset: z.number().check(z.int(), z.minimum(0)),
		id: z.optional(z.string()),
	}),
)
const valuesSchema = z.object({
	callProtection: z.optional(z.string()),
	immutables: z.optional(z.record(z.string(), z.string())),
	libraries: z.optional(z.record(z.string(), z.string())),
})

/** Reconstructs recorded runtime bytes without inferring new immutable or library values from a candidate. */
export function restoreVerifiedRuntime(options: {
	code: Uint8Array
	transformations: string | null
	values: string | null
}): Hex.Hex | null {
	try {
		let code = Hex.fromBytes(options.code).slice(2)
		if (!code) return null
		const transformations = z.parse(
			transformationsSchema,
			JSON.parse(options.transformations ?? '[]'),
		)
		const values = z.parse(valuesSchema, JSON.parse(options.values ?? '{}'))
		const ranges: Array<{ start: number; end: number }> = []
		for (const transformation of transformations) {
			const value =
				transformation.reason === 'callProtection'
					? values.callProtection
					: transformation.id === undefined
						? undefined
						: (transformation.reason === 'immutable'
								? values.immutables
								: values.libraries)?.[transformation.id]
			if (!value || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) return null
			const start = transformation.offset * 2
			const replacement = value.slice(2)
			const end = start + replacement.length
			if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end))
				return null
			if (transformation.type === 'insert') {
				// Vyper appends its recorded immutables; other insertions have no established runtime meaning.
				if (transformation.reason !== 'immutable' || start !== code.length)
					return null
			} else if (end > code.length) return null
			if (ranges.some((range) => start < range.end && end > range.start))
				return null
			ranges.push({ start, end })
			code =
				code.slice(0, start) +
				replacement +
				code.slice(transformation.type === 'insert' ? start : end)
		}
		return `0x${code}`
	} catch {
		return null
	}
}
