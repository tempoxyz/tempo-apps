import { llmsResponder, render } from '@tempo/llms'
import { fromHono } from '@tempo/llms/hono'
import type { App } from '../../index.js'
import { docs } from './content.js'
import fullTemplate from './llms-full.template.md?raw'
import indexTemplate from './llms.template.md?raw'

export type LlmsFile = 'llms.txt' | 'llms-full.txt'

/** Serves both files, rendered once per isolate from the routes `app` serves. */
export function serveLlms(app: App): (file: LlmsFile) => Response {
	return llmsResponder(() =>
		render({
			docs,
			routes: fromHono(app),
			templates: { 'llms.txt': indexTemplate, 'llms-full.txt': fullTemplate },
		}),
	)
}
