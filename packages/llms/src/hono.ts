import type { Hono } from 'hono'
import { inspectRoutes } from 'hono/dev'
import type { ExtractSchema } from 'hono/types'
import type { ApiDocFor, DocBase } from './docs'
import type { Route } from './render'

/**
 * Routes from a Hono app's `app.routes`, one per path with every method it
 * handles. Middleware (handlers that take `next`, as `hono/dev` tells them
 * apart) is skipped, so `app.use()` paths are not listed. Every route is an
 * API route.
 */
export function fromHono(app: Pick<Hono, 'routes'>): Route[] {
	const methods = new Map<string, string[]>()
	for (const route of inspectRoutes(app as Hono)) {
		if (route.isMiddleware) continue
		const path = routerPath(route.path)
		const list = methods.get(path) ?? []
		if (!list.includes(route.method)) list.push(route.method)
		methods.set(path, list)
	}
	return [...methods].map(([path, methods]) => ({ path, kind: 'api', methods }))
}

/** `/keys/:key{[a-z]+}` becomes `/keys/$key`, the form `render` reads. */
function routerPath(path: string): string {
	return path
		.split('/')
		.map((segment) =>
			segment.startsWith(':')
				? `$${segment.slice(1).split(/[{?]/)[0]}`
				: segment,
		)
		.join('/')
}

type RouterPath<Path extends string> =
	Path extends `${infer Head}/${infer Rest}`
		? `${Segment<Head>}/${RouterPath<Rest>}`
		: Segment<Path>

type Segment<Part extends string> = Part extends `:${infer Param}`
	? `$${Param extends `${infer Name}{${string}`
			? Name
			: Param extends `${infer Name}?`
				? Name
				: Param}`
	: Part

/** Request parts a validator parses that `api()` documents. */
type Documented = 'query' | 'json' | 'form'

/** Keys of the query or body any method of the path validates. */
type InputKeys<Endpoints> = {
	[Method in keyof Endpoints]: Endpoints[Method] extends { input: infer Input }
		? {
				[Part in keyof Input & Documented]-?: keyof NonNullable<Input[Part]>
			}[keyof Input & Documented]
		: never
}[keyof Endpoints]

type Entry<Endpoints> =
	| { hidden: string }
	| ([InputKeys<Endpoints>] extends [never]
			? DocBase & { input?: never; params?: never }
			: ApiDocFor<InputKeys<Endpoints>>)

/**
 * Docs for every route in a Hono app's schema, given `typeof app`. Type
 * checking fails when a route has no entry or an entry names one that does
 * not exist. A route whose handler validates its query or body must be
 * documented by `api(schema, doc)` with a schema of the same keys, and a
 * route without one cannot be.
 *
 * Hono only records routes registered by chaining (`new Hono().get(...)`),
 * so an app registered statement by statement has an empty schema.
 */
export type HonoDocs<App> = {
	[Path in keyof ExtractSchema<App> & string as RouterPath<Path>]: Entry<
		ExtractSchema<App>[Path]
	>
}
