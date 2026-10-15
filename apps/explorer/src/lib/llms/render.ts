import { z } from 'zod/mini'
import fullTemplate from './llms-full.template.md?raw'
import indexTemplate from './llms.template.md?raw'

/**
 * A string describes the parameter and `null` leaves it out (internal, or a
 * path param). The object form can also describe each allowed value, in
 * display order, or mark a parameter required when the route accepts its
 * absence but returns nothing useful without it.
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
	/** API routes: the schema the handler parses. Pages use `validateSearch`. */
	input?: z.core.$ZodType | undefined
	params?: Record<string, ParamDoc> | undefined
}

export type Docs = Record<string, RouteDoc | { hidden: string }>

/** The parts of a router route this file reads. */
export type RuntimeRoute = {
	fullPath: string
	options: {
		validateSearch?: unknown
		server?: { handlers?: object }
	}
}

export type Param = {
	name: string
	/** Non-literal member types, e.g. `number` or `hex`. */
	types: string[]
	/** Literal members, e.g. tab names or `latest`. */
	values: string[]
	default?: string | undefined
	required: boolean
}

type DocumentedRoute = {
	display: string
	methods: string[]
	params: Param[]
	doc: RouteDoc
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

const code = (value: string) => `\`${value}\``

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

function typeName(schema: JsonSchema): string {
	if (schema.format === 'hex') return 'hex'
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

/** `/address/$address` → `/address/{address}`. */
function displayPath(path: string): string {
	return path.replace(/\$(\w+)/g, '{$1}')
}

/** Pairs every documented path with its route, in content order. */
function documentRoutes(docs: Docs, routes: RuntimeRoute[]) {
	const byPath = new Map(routes.map((route) => [route.fullPath, route]))
	const pages: DocumentedRoute[] = []
	const api: DocumentedRoute[] = []
	for (const [path, doc] of Object.entries(docs)) {
		if ('hidden' in doc) continue
		const route = byPath.get(path)
		if (!route) throw new Error(`${path}: documented but no route exists`)
		const isApi = path.startsWith('/api/')
		const documented = {
			display: displayPath(path),
			methods: Object.keys(route.options.server?.handlers ?? {}),
			params: toParams(isApi ? doc.input : route.options.validateSearch),
			doc,
		}
		;(isApi ? api : pages).push(documented)
	}
	return { pages, api }
}

/** Parameters with a description, in content order. */
function visibleParams(route: DocumentedRoute) {
	return Object.entries(route.doc.params ?? {}).flatMap(([name, doc]) => {
		const param = route.params.find((item) => item.name === name)
		return param && doc ? [{ param, doc }] : []
	})
}

function describedValues(doc: Exclude<ParamDoc, null>) {
	return typeof doc === 'string' ? undefined : doc.values
}

function isRequired(param: Param, doc: Exclude<ParamDoc, null>): boolean {
	return param.required || (typeof doc === 'object' && doc.required === true)
}

/** Described values replace the schema's types, which may be a plain `string`. */
function options(param: Param, doc: Exclude<ParamDoc, null>) {
	const described = describedValues(doc)
	return described
		? { types: [], values: [] }
		: { types: param.types, values: param.values }
}

function renderParam(param: Param, doc: Exclude<ParamDoc, null>): string[] {
	const { types, values } = options(param, doc)
	const meta = [
		[...types, ...values.map(code)].join(' | '),
		param.default ? `default ${code(param.default)}` : '',
		isRequired(param, doc) ? 'required' : '',
	]
		.filter(Boolean)
		.join(', ')
	const description = typeof doc === 'string' ? doc : doc.description
	const lines = [
		`- ${code(param.name)}${meta ? ` (${meta})` : ''}: ${description}`,
	]
	for (const [value, text] of Object.entries(describedValues(doc) ?? {}))
		lines.push(`  - ${code(value)}: ${text}`)
	return lines
}

/** `?tab=transactions|holdings` or `?page={number}`. */
function queryTemplate(param: Param, doc: Exclude<ParamDoc, null>): string {
	const { types, values } = options(param, doc)
	const allowed = [
		...Object.keys(describedValues(doc) ?? {}),
		...values,
		...types.map((type) => `{${type}}`),
	]
	return `?${param.name}=${allowed.join('|')}`
}

function paramList(title: string, params: ReturnType<typeof visibleParams>) {
	if (!params.length) return []
	return [
		`${title}:`,
		'',
		...params.flatMap(({ param, doc }) => renderParam(param, doc)),
		'',
	]
}

function requestLine(route: DocumentedRoute): string {
	return route.methods.map((method) => `${method} ${route.display}`).join(', ')
}

function renderFullPages(routes: DocumentedRoute[]): string {
	return routes
		.flatMap((route) => [
			`### ${route.doc.title}`,
			'',
			`- ${code(route.display)}`,
			'',
			route.doc.description,
			'',
			...paramList('Query parameters', visibleParams(route)),
		])
		.join('\n')
		.trim()
}

function renderFullApi(routes: DocumentedRoute[]): string {
	return routes
		.flatMap((route) => [
			`### ${route.doc.title}`,
			'',
			`- ${code(requestLine(route))}`,
			'',
			route.doc.description,
			'',
			...paramList(
				route.methods.includes('GET') ? 'Query parameters' : 'JSON body',
				visibleParams(route),
			),
		])
		.join('\n')
		.trim()
}

function renderPageIndex(routes: DocumentedRoute[]): string {
	return routes
		.flatMap((route) => [
			`- ${route.doc.title}: ${code(route.display)}`,
			...visibleParams(route).map(
				({ param, doc }) => `  - ${code(queryTemplate(param, doc))}`,
			),
		])
		.join('\n')
}

function renderApiIndex(routes: DocumentedRoute[]): string {
	return routes
		.map((route) => {
			const required = route.methods.includes('GET')
				? visibleParams(route).filter(({ param, doc }) =>
						isRequired(param, doc),
					)
				: []
			const query = required
				.map(({ param, doc }) => queryTemplate(param, doc).slice(1))
				.join('&')
			return `- ${route.doc.title}: ${code(`${requestLine(route)}${query ? `?${query}` : ''}`)}`
		})
		.join('\n')
}

function fill(template: string, sections: Record<string, string>) {
	return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
		const section = sections[name]
		if (section === undefined) throw new Error(`Unknown section {{${name}}}`)
		return section
	})
}

export function render(docs: Docs, routes: RuntimeRoute[]) {
	const { pages, api } = documentRoutes(docs, routes)
	return {
		'llms.txt': fill(indexTemplate, {
			pages: renderPageIndex(pages),
			api: renderApiIndex(api),
		}),
		'llms-full.txt': fill(fullTemplate, {
			pages: renderFullPages(pages),
			api: renderFullApi(api),
		}),
	}
}
