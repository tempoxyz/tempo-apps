import type { Executor } from '@cloudflare/codemode'

/** The character cap codemode applies to a code tool result. */
export const MAX_CODE_RESULT_CHARS = 24_000

const TRUNCATION_NOTICE =
	'\n\n--- TRUNCATED ---\nResult exceeded the 24,000-character limit. Narrow the request to reduce response size.'

class BudgetExceeded extends Error {}

/**
 * Serializes `value` like `JSON.stringify(value, null, 2)`, but stops once the output passes
 * `maxChars`, so the work is bounded by the cap rather than by the size of the object graph.
 * A graph that reuses the same child many times (or contains a cycle) would otherwise expand
 * into far more text than the cap before being truncated. Returns the text and whether it was cut.
 */
export function boundedStringify(
	value: unknown,
	maxChars: number,
): { text: string; truncated: boolean } {
	const parts: string[] = []
	let length = 0
	const push = (part: string): true => {
		parts.push(part)
		length += part.length
		if (length > maxChars) throw new BudgetExceeded()
		return true
	}
	const write = (input: unknown, indent: string, inArray: boolean): boolean => {
		let current = input
		if (
			current !== null &&
			typeof current === 'object' &&
			typeof (current as { toJSON?: unknown }).toJSON === 'function'
		)
			current = (current as { toJSON: () => unknown }).toJSON()
		if (current === null) return push('null')
		switch (typeof current) {
			case 'string':
				return push(JSON.stringify(current))
			case 'number':
				return push(Number.isFinite(current) ? String(current) : 'null')
			case 'boolean':
				return push(String(current))
			case 'bigint':
				throw new TypeError('Do not know how to serialize a BigInt')
			case 'undefined':
			case 'function':
			case 'symbol':
				if (inArray) return push('null')
				return false
		}
		const inner = `${indent}  `
		if (Array.isArray(current)) {
			if (current.length === 0) return push('[]')
			push('[')
			for (let i = 0; i < current.length; i++) {
				push(i === 0 ? `\n${inner}` : `,\n${inner}`)
				write(current[i], inner, true)
			}
			push(`\n${indent}]`)
			return true
		}
		let first = true
		for (const key of Object.keys(current as object)) {
			const child = (current as Record<string, unknown>)[key]
			let childValue = child
			if (
				childValue !== null &&
				typeof childValue === 'object' &&
				typeof (childValue as { toJSON?: unknown }).toJSON === 'function'
			)
				childValue = (childValue as { toJSON: () => unknown }).toJSON()
			if (
				childValue === undefined ||
				typeof childValue === 'function' ||
				typeof childValue === 'symbol'
			)
				continue
			push(first ? `{\n${inner}` : `,\n${inner}`)
			first = false
			push(`${JSON.stringify(key)}: `)
			write(childValue, inner, false)
		}
		push(first ? '{}' : `\n${indent}}`)
		return true
	}
	try {
		if (!write(value, '', false)) return { text: 'undefined', truncated: false }
		return { text: parts.join(''), truncated: false }
	} catch (error) {
		if (!(error instanceof BudgetExceeded)) throw error
		return { text: parts.join('').slice(0, maxChars), truncated: true }
	}
}

/**
 * Converts a code tool result to text within {@link MAX_CODE_RESULT_CHARS}, so codemode never
 * serializes an unbounded value in the host isolate.
 */
export function boundCodeResult(value: unknown): string {
	if (typeof value === 'string') {
		if (value.length <= MAX_CODE_RESULT_CHARS) return value
		return (
			value.slice(0, MAX_CODE_RESULT_CHARS - TRUNCATION_NOTICE.length) +
			TRUNCATION_NOTICE
		)
	}
	const { text, truncated } = boundedStringify(
		value,
		MAX_CODE_RESULT_CHARS - TRUNCATION_NOTICE.length,
	)
	return truncated ? text + TRUNCATION_NOTICE : text
}

/** Wraps an executor so every successful result reaches codemode as bounded text. */
export function withBoundedResults(executor: Executor): Executor {
	return {
		async execute(...args: Parameters<Executor['execute']>) {
			const result = await executor.execute(...args)
			if (result.error) return result
			try {
				return { ...result, result: boundCodeResult(result.result) }
			} catch (error) {
				return {
					...result,
					result: undefined,
					error: error instanceof Error ? error.message : String(error),
				}
			}
		},
	}
}
