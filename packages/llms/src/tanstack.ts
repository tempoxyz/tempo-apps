import type { ApiDoc, DocBase, Params } from './docs'
import type { Route } from './render'

/** The parts of a TanStack Router route this adapter reads. */
type RouterRoute = {
	isRoot?: boolean
	fullPath: string
	options: {
		path?: string
		validateSearch?: unknown
		server?: { handlers?: object }
	}
}

/**
 * Routes from a TanStack Router instance (its `routesById`, so `fullPath` is
 * resolved). The root and pathless layouts are skipped: they share `/` with
 * the index route and are not addressable on their own.
 */
export function fromTanStackRouter(
	router: { routesById: object },
	apiPrefix = '/api/',
): Route[] {
	return (Object.values(router.routesById) as RouterRoute[])
		.filter((route) => !route.isRoot && route.options.path !== undefined)
		.map((route) => ({
			path: route.fullPath,
			kind: route.fullPath.startsWith(apiPrefix) ? 'api' : 'page',
			methods: Object.keys(route.options.server?.handlers ?? {}),
			search: route.options.validateSearch,
		}))
}

type SearchSchema<Route> = Route extends {
	types: { searchSchema: infer Schema }
}
	? Schema
	: never

type Entry<Routes, Path extends keyof Routes, ApiPrefix extends string> =
	| { hidden: string }
	| (Path extends `${ApiPrefix}${string}`
			? (DocBase & { input?: never; params?: never }) | ApiDoc
			: DocBase & Params<SearchSchema<Routes[Path]>>)

/**
 * Docs for every route in a TanStack `FileRoutesByFullPath`. Type checking
 * fails when a route, page search param, or described value has no entry, or
 * an entry names one that does not exist. API routes document their params
 * through `api(schema, doc)`.
 */
export type TanStackDocs<Routes, ApiPrefix extends string = '/api/'> = {
	[Path in keyof Routes]: Entry<Routes, Path, ApiPrefix>
}
