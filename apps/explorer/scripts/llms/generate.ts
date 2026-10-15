#!/usr/bin/env node
/**
 * Generates `public/llms.txt` and `public/llms-full.txt` from `src/routes`,
 * `wrangler.json`, and the hand-written content and templates in this
 * directory.
 *
 * Usage:
 *   pnpm gen:llms      - Write both files
 *   pnpm check:llms    - Fail when a route is undocumented, a documented path
 *                        or parameter does not exist, or the files are stale
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getExplorerHostPolicy } from '../../src/lib/explorer-indexing.ts'
import wrangler from '../../wrangler.json' with { type: 'json' }
import { api, hidden, type ParamDoc, pages, type RouteDoc } from './content.ts'
import { extractRoutes, type Param, type Route } from './extract.ts'

export type DocumentedRoute = Route & { display: string; doc: RouteDoc }

const root = resolve(import.meta.dirname, '../..')
const outputs = {
	'llms.txt': 'llms.template.md',
	'llms-full.txt': 'llms-full.template.md',
} as const

const code = (value: string) => `\`${value}\``

/** `/address/$address` → `/address/{address}`. */
export function displayPath(path: string): string {
	return path.replace(/\$(\w+)/g, '{$1}')
}

/** Pairs every route with its content entry; every route must have exactly one. */
export function documentRoutes(routes: Route[]): {
	pages: DocumentedRoute[]
	api: DocumentedRoute[]
	errors: string[]
} {
	const errors: string[] = []
	const byPath = new Map(
		routes.map((route) => [displayPath(route.path), route]),
	)
	const claimed = new Set<string>()
	const claim = (path: string) => {
		if (claimed.has(path)) errors.push(`${path}: listed more than once`)
		claimed.add(path)
		const route = byPath.get(path)
		if (!route) errors.push(`${path}: documented but no route exists`)
		return route
	}
	const pick = (docs: Record<string, RouteDoc>, kind: Route['kind']) =>
		Object.entries(docs).flatMap(([path, doc]) => {
			const route = claim(path)
			if (!route) return []
			if (route.kind !== kind) {
				errors.push(`${path}: listed as ${kind} but is ${route.kind}`)
				return []
			}
			errors.push(...paramErrors(path, route, doc))
			return [{ ...route, display: path, doc }]
		})

	const documented = { pages: pick(pages, 'page'), api: pick(api, 'api') }
	for (const path of Object.keys(hidden)) claim(path)
	for (const [path, route] of byPath)
		if (!claimed.has(path))
			errors.push(
				`${path}: undocumented route (${route.file}); add it to scripts/llms/content.ts`,
			)
	return { ...documented, errors }
}

function paramErrors(path: string, route: Route, doc: RouteDoc): string[] {
	const docs = doc.params ?? {}
	const errors: string[] = []
	for (const param of route.params)
		if (!(param.name in docs))
			errors.push(`${path}: undocumented parameter ${code(param.name)}`)
	for (const [name, paramDoc] of Object.entries(docs)) {
		const param = route.params.find((item) => item.name === name)
		if (!param) {
			errors.push(`${path}: documented parameter ${code(name)} does not exist`)
			continue
		}
		if (!paramDoc || typeof paramDoc === 'string') continue
		const actual = [...param.values].sort().join(', ')
		const listed = Object.keys(paramDoc.values).sort().join(', ')
		if (actual !== listed)
			errors.push(
				`${path}: ${code(name)} accepts ${actual}, but content lists ${listed}`,
			)
	}
	return errors
}

/** Parameters with a description, in content order. */
function visibleParams(route: DocumentedRoute) {
	return Object.entries(route.doc.params ?? {}).flatMap(([name, doc]) => {
		const param = route.params.find((item) => item.name === name)
		return param && doc ? [{ param, doc }] : []
	})
}

function allowedValues(param: Param, doc: Exclude<ParamDoc, null>): string[] {
	return typeof doc === 'string' ? param.values : Object.keys(doc.values)
}

function typeSummary(param: Param, values: string[]): string {
	return [...param.types, ...values.map(code)].join(' | ')
}

function renderParam(param: Param, doc: Exclude<ParamDoc, null>): string[] {
	const listed = typeof doc === 'object'
	const meta = [
		typeSummary(param, listed ? [] : param.values),
		param.default ? `default ${code(param.default)}` : '',
		param.required ? 'required' : '',
	]
		.filter(Boolean)
		.join(', ')
	const description = typeof doc === 'string' ? doc : doc.description
	const lines = [
		`- ${code(param.name)}${meta ? ` (${meta})` : ''}: ${description}`,
	]
	if (listed)
		for (const [value, text] of Object.entries(doc.values))
			lines.push(`  - ${code(value)}: ${text}`)
	return lines
}

/** `?tab=transactions|holdings` or `?page={number}`. */
function queryTemplate(param: Param, doc: Exclude<ParamDoc, null>): string {
	const options = [
		...allowedValues(param, doc),
		...param.types.map((type) => `{${type}}`),
	]
	return `?${param.name}=${options.join('|')}`
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
		.flatMap((route) => {
			const location = route.methods.includes('GET')
				? 'Query parameters'
				: 'JSON body'
			return [
				`### ${route.doc.title}`,
				'',
				`- ${code(requestLine(route))}`,
				'',
				route.doc.description,
				'',
				...(route.pathParams.length
					? [
							'Path parameters:',
							'',
							...route.pathParams.map(
								(param) =>
									`- ${code(param.name)} (${typeSummary(param, param.values)})`,
							),
							'',
						]
					: []),
				...paramList(location, visibleParams(route)),
			]
		})
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
				? visibleParams(route).filter(({ param }) => param.required)
				: []
			const query = required
				.map(({ param, doc }) => queryTemplate(param, doc).slice(1))
				.join('&')
			return `- ${route.doc.title}: ${code(`${requestLine(route)}${query ? `?${query}` : ''}`)}`
		})
		.join('\n')
}

/** One row per `wrangler.json` environment; redirecting hosts are aliases. */
export function renderNetworks(): string {
	const rows = Object.entries(wrangler.env).map(([name, env]) => {
		const hosts = env.routes.map((route) => route.pattern)
		const aliases = hosts.filter((host) =>
			getExplorerHostPolicy(`https://${host}/`),
		)
		const primary = hosts.filter((host) => !aliases.includes(host))
		return `| ${name} | ${primary.map((host) => `https://${host}`).join(', ')} | ${aliases.join(', ') || '-'} |`
	})
	return ['| Network | URL | Redirects from |', '| --- | --- | --- |', ...rows]
		.join('\n')
		.trim()
}

function renderTemplate(template: string, sections: Record<string, string>) {
	const text = readFileSync(join(import.meta.dirname, template), 'utf8')
	return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
		const section = sections[name]
		if (section === undefined)
			throw new Error(`${template}: unknown section {{${name}}}`)
		return section
	})
}

/**
 * Every path in a code span, fenced block, or link must match a documented
 * route, and its query parameters must be documented with a valid value.
 */
export function referenceErrors(
	text: string,
	routes: DocumentedRoute[],
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
		const error = checkReference(reference, routes)
		return error ? [`${reference}: ${error}`] : []
	})
}

function checkReference(
	reference: string,
	routes: DocumentedRoute[],
): string | undefined {
	const [path = '', query = ''] = reference.split('?')
	if (path in outputs || existsSync(join(root, 'public', path))) return
	const segments = path.split('/')
	const route = routes
		.filter((item) => {
			const parts = item.path.split('/')
			return (
				parts.length === segments.length &&
				parts.every(
					(part, index) =>
						part === segments[index] ||
						(part.startsWith('$') && segments[index]),
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
		if (!allowed.length || param.types.length) continue
		for (const option of value.split('|'))
			if (!/^\{.+\}$/.test(option) && !allowed.includes(option))
				return `${code(`${name}=${option}`)} is not one of ${allowed.join(', ')}`
	}
	return undefined
}

function literalSegments(route: Route): number {
	return route.path.split('/').filter((part) => !part.startsWith('$')).length
}

export function generate(): {
	files: Record<keyof typeof outputs, string>
	errors: string[]
	summary: string
} {
	const documented = documentRoutes(extractRoutes())
	const sections = { networks: renderNetworks() }
	const files = {
		'llms.txt': renderTemplate(outputs['llms.txt'], {
			...sections,
			pages: renderPageIndex(documented.pages),
			api: renderApiIndex(documented.api),
		}),
		'llms-full.txt': renderTemplate(outputs['llms-full.txt'], {
			...sections,
			pages: renderFullPages(documented.pages),
			api: renderFullApi(documented.api),
		}),
	}
	const routes = [...documented.pages, ...documented.api]
	const errors = [
		...documented.errors,
		...Object.entries(files).flatMap(([name, text]) =>
			referenceErrors(text, routes).map((error) => `${name}: ${error}`),
		),
	]
	return {
		files,
		errors,
		summary: `${documented.pages.length} pages, ${documented.api.length} API routes`,
	}
}

if (import.meta.main) {
	const check = process.argv.includes('--check')
	const { files, errors, summary } = generate()
	if (errors.length) {
		console.error(
			`Explorer llms.txt does not match src/routes:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
		)
		process.exit(1)
	}
	const stale: string[] = []
	for (const [name, text] of Object.entries(files)) {
		const file = join(root, 'public', name)
		if (!check) writeFileSync(file, text)
		else if (!existsSync(file) || readFileSync(file, 'utf8') !== text)
			stale.push(`public/${name}`)
	}
	if (stale.length) {
		console.error(
			`${stale.join(' and ')} out of date. Run \`pnpm gen:llms\` in apps/explorer.`,
		)
		process.exit(1)
	}
	console.log(
		`${check ? 'Checked' : 'Generated'} public/llms.txt and public/llms-full.txt (${summary})`,
	)
}
