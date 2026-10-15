import { llmsResponder, render } from '@tempo/llms'
import { fromTanStackRouter } from '@tempo/llms/tanstack'
import { getRouter } from '#router'
import { docs } from './content'
import fullTemplate from './llms-full.template.md?raw'
import indexTemplate from './llms.template.md?raw'

/** Renders both files once per isolate, from the routes this worker serves. */
export const llmsResponse = llmsResponder(() =>
	render({
		docs,
		// A router, not the bare route tree, so each route's `fullPath` is resolved.
		routes: fromTanStackRouter(getRouter()),
		templates: { 'llms.txt': indexTemplate, 'llms-full.txt': fullTemplate },
	}),
)
