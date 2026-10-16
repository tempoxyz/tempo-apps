import type { z } from 'zod/mini'

/**
 * A string describes the parameter and `null` leaves it out (internal). The
 * object form can also describe each allowed value, in display order, or mark
 * a parameter required when the route accepts its absence but returns nothing
 * useful without it.
 */
export type ParamDoc =
	| string
	| {
			description: string
			values?: Record<string, string>
			required?: true
	  }
	| null

export type RouteDoc = {
	title: string
	description: string
	/** API routes: the schema the handler parses. Pages use their route's search schema. */
	input?: z.core.$ZodType | undefined
	params?: Record<string, ParamDoc> | undefined
}

/** Every route, keyed by its router path: documented, or hidden with a reason. */
export type Docs = Record<string, RouteDoc | { hidden: string }>

/** `ParamDoc` with `values` keyed by the schema's string literals. */
export type TypedParamDoc<Value> =
	| string
	| {
			description: string
			values?: Record<Extract<NonNullable<Value>, string>, string>
			required?: true
	  }
	| null

/** Every parameter the schema parses needs an entry, and no others. */
export type Params<T> = [keyof T] extends [never]
	? { params?: never }
	: { params: { [K in keyof T]-?: TypedParamDoc<T[K]> } }

export type DocBase = { title: string; description: string }

declare const checked: unique symbol
/** A `RouteDoc` whose params were checked against its `input` by `api()`. */
export type ApiDoc = RouteDoc & { [checked]: true }

declare const inputKeys: unique symbol
/**
 * An `ApiDoc` whose `input` has exactly `Keys`, held invariantly so an adapter
 * can require the keys its router validates.
 */
export type ApiDocFor<Keys extends PropertyKey> = ApiDoc & {
	[inputKeys]: (keys: Keys) => Keys
}

/** Documents an API route whose handler parses `input`; params must match its keys. */
export function api<Schema extends z.core.$ZodType>(
	input: Schema,
	doc: DocBase & Params<z.output<Schema>>,
): ApiDocFor<keyof z.input<Schema>> {
	return { ...doc, input } as RouteDoc as ApiDocFor<keyof z.input<Schema>>
}
