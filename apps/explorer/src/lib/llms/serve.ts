import { getRouter } from '#router'
import { docs } from './content'
import { type RuntimeRoute, render } from './render'

let files: ReturnType<typeof render> | undefined

/** Renders both files once per isolate, from the routes this worker serves. */
export function llmsResponse(file: keyof ReturnType<typeof render>) {
	// A router, not the bare route tree, so each route's `fullPath` is resolved.
	files ??= render(
		docs,
		Object.values(getRouter().routesById) as RuntimeRoute[],
	)
	return new Response(files[file], {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	})
}
