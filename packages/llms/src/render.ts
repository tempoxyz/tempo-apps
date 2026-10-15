import type { Docs, ParamDoc, RouteDoc } from './docs'
import { type Param, toParams } from './params'

/** A route as the renderer needs it, independent of the router that serves it. */
export type Route = {
	/** Router path with `$name` params, e.g. `/address/$address`. */
	path: string
	kind: 'page' | 'api'
	methods: string[]
	/** Page routes: the search schema the router validates. */
	search?: unknown
}

type DocumentedRoute = {
	path: string
	display: string
	methods: string[]
	params: Param[]
	doc: RouteDoc
}

type Described = Exclude<ParamDoc, null>

const code = (value: string) => `\`${value}\``

/**
 * Fills each template's `{{pages}}`, `{{api}}`, `{{pageIndex}}`, and
 * `{{apiIndex}}` sections from the documented routes. Throws when a route
 * or parameter is undocumented, a doc names one that does not exist, or a
 * path in the output does not match a documented route and its parameters.
 */
export function render<Name extends string>(options: {
	docs: Docs
	routes: Route[]
	templates: Record<Name, string>
}): Record<Name, string> {
	const { pages, api } = documentRoutes(options.docs, options.routes)
	const sections = {
		pages: renderPages(pages),
		api: renderApi(api),
		pageIndex: renderPageIndex(pages),
		apiIndex: renderApiIndex(api),
	}
	const names = Object.keys(options.templates) as Name[]
	const files = Object.fromEntries(
		names.map((name) => [name, fill(options.templates[name], sections)]),
	) as Record<Name, string>
	const errors = names.flatMap((name) =>
		referenceErrors(files[name], [...pages, ...api], names).map(
			(error) => `${name}: ${error}`,
		),
	)
	if (errors.length) throw new Error(errors.join('\n'))
	return files
}

/** Pairs every documented path with its route, in doc order. */
function documentRoutes(docs: Docs, routes: Route[]) {
	const byPath = new Map<string, Route>()
	for (const route of routes) {
		if (byPath.has(route.path))
			throw new Error(`${route.path}: more than one route`)
		byPath.set(route.path, route)
	}
	for (const path of byPath.keys())
		if (!(path in docs)) throw new Error(`${path}: undocumented route`)

	const pages: DocumentedRoute[] = []
	const api: DocumentedRoute[] = []
	for (const [path, doc] of Object.entries(docs)) {
		const route = byPath.get(path)
		if (!route) throw new Error(`${path}: documented but no route exists`)
		if ('hidden' in doc) continue
		const params = toParams(route.kind === 'api' ? doc.input : route.search)
		assertParams(path, params, doc)
		;(route.kind === 'api' ? api : pages).push({
			path,
			display: path.replace(/\$(\w+)/g, '{$1}'),
			methods: route.methods,
			params,
			doc,
		})
	}
	return { pages, api }
}

function assertParams(path: string, params: Param[], doc: RouteDoc) {
	const docs = doc.params ?? {}
	for (const param of params)
		if (!(param.name in docs))
			throw new Error(`${path}: undocumented parameter ${code(param.name)}`)
	for (const name of Object.keys(docs))
		if (!params.some((param) => param.name === name))
			throw new Error(`${path}: parameter ${code(name)} does not exist`)
}

/** Parameters with a description, in doc order. */
function visibleParams(route: DocumentedRoute) {
	return Object.entries(route.doc.params ?? {}).flatMap(([name, doc]) => {
		const param = route.params.find((item) => item.name === name)
		return param && doc ? [{ param, doc }] : []
	})
}

function describedValues(doc: Described) {
	return typeof doc === 'string' ? undefined : doc.values
}

function isRequired(param: Param, doc: Described): boolean {
	return param.required || (typeof doc === 'object' && doc.required === true)
}

/** Described values replace the schema's types, which may be a plain `string`. */
function options(param: Param, doc: Described) {
	return describedValues(doc)
		? { types: [], values: [] }
		: { types: param.types, values: param.values }
}

function allowedValues(param: Param, doc: Described): string[] {
	const described = describedValues(doc)
	return described ? Object.keys(described) : param.values
}

function renderParam(param: Param, doc: Described): string[] {
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
function queryTemplate(param: Param, doc: Described): string {
	const { types } = options(param, doc)
	const allowed = [
		...allowedValues(param, doc),
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

function renderPages(routes: DocumentedRoute[]): string {
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

function renderApi(routes: DocumentedRoute[]): string {
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

/**
 * Every path in a code span, fenced block, or link must match a documented
 * route (or one of the rendered files), and its query parameters must be
 * documented with a valid value. `{placeholder}` segments and values match
 * anything.
 */
function referenceErrors(
	text: string,
	routes: DocumentedRoute[],
	files: string[],
): string[] {
	const references = new Set<string>()
	const collect = (value: string) => {
		for (const token of value.split(/\s+/))
			if (token.startsWith('/')) references.add(token)
	}
	const fenced = /^```[^\n]*\n([\s\S]*?)^```$/gm
	for (const [, block = ''] of text.matchAll(fenced)) collect(block)
	const prose = text.replace(fenced, '')
	for (const [, span = ''] of prose.matchAll(/`([^`\n]+)`/g)) collect(span)
	for (const [, href = ''] of prose.matchAll(/\]\((\/[^)\s]*)\)/g))
		references.add(href)

	return [...references].flatMap((reference) => {
		const error = checkReference(reference, routes, files)
		return error ? [`${reference}: ${error}`] : []
	})
}

function checkReference(
	reference: string,
	routes: DocumentedRoute[],
	files: string[],
): string | undefined {
	const [path = '', query = ''] = reference.split('?')
	if (files.includes(path.slice(1))) return undefined
	const segments = path.split('/')
	const route = routes
		.filter((item) => {
			const parts = item.path.split('/')
			return (
				parts.length === segments.length &&
				parts.every(
					(part, index) =>
						part === segments[index] ||
						(part.startsWith('$') && Boolean(segments[index])),
				)
			)
		})
		.sort((a, b) => literalSegments(b) - literalSegments(a))[0]
	if (!route) return 'no documented route matches'

	for (const pair of query.split('&').filter(Boolean)) {
		const [name = '', value = ''] = pair.split('=')
		const param = route.params.find((item) => item.name === name)
		const doc = route.doc.params?.[name]
		if (!param || !doc)
			return `${code(name)} is not a documented parameter of ${route.display}`
		const allowed = allowedValues(param, doc)
		if (!allowed.length || options(param, doc).types.length) continue
		for (const option of value.split('|'))
			if (!/^\{.+\}$/.test(option) && !allowed.includes(option))
				return `${code(`${name}=${option}`)} is not one of ${allowed.join(', ')}`
	}
	return undefined
}

function literalSegments(route: DocumentedRoute): number {
	return route.path.split('/').filter((part) => !part.startsWith('$')).length
}
