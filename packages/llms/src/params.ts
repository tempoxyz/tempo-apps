import { z } from 'zod/mini'

/** A query or body parameter read from the zod schema a route parses. */
export type Param = {
	name: string
	/** Non-literal member types, e.g. `number`, or a JSON Schema `format` such as `hex`. */
	types: string[]
	/** Literal members, e.g. tab names or `latest`. */
	values: string[]
	default?: string | undefined
	required: boolean
}

type JsonSchema = {
	type?: string
	format?: string
	const?: unknown
	enum?: unknown[]
	anyOf?: JsonSchema[]
	items?: JsonSchema
	default?: unknown
	properties?: Record<string, JsonSchema>
	required?: string[]
}

/** One param per property of an object schema, read from its JSON Schema input. */
export function toParams(schema: unknown): Param[] {
	if (!schema) return []
	if (typeof schema === 'function')
		throw new Error('Pass the schema itself, not `schema.parse`')
	const json = z.toJSONSchema(schema as z.core.$ZodType, {
		io: 'input',
		unrepresentable: 'any',
	}) as JsonSchema
	return Object.entries(json.properties ?? {}).map(([name, property]) => {
		const types = new Set<string>()
		const values: string[] = []
		for (const member of property.anyOf ?? [property]) {
			if (member.const !== undefined) values.push(String(member.const))
			else if (member.enum) values.push(...member.enum.map(String))
			else types.add(typeName(member))
		}
		const fallback = property.default
		return {
			name,
			types: [...types].sort(),
			values: values.sort(compareValues),
			default:
				fallback === undefined || typeof fallback === 'object'
					? undefined
					: String(fallback),
			required: json.required?.includes(name) ?? false,
		}
	})
}

/** Marks a string schema's JSON Schema `format`, which renders as its type. */
export const format = (name: string) => z.meta({ format: name })

function typeName(schema: JsonSchema): string {
	if (schema.format) return schema.format
	if (schema.type === 'array')
		return `${schema.items ? typeName(schema.items) : 'unknown'}[]`
	if (schema.type === 'integer') return 'number'
	return schema.type ?? 'string'
}

/** Numeric values by size, others by code point so output never depends on locale. */
function compareValues(a: string, b: string): number {
	const numeric = Number(a) - Number(b)
	if (!Number.isNaN(numeric)) return numeric
	return a < b ? -1 : a > b ? 1 : 0
}
