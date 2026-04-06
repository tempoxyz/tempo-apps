import { Hono } from 'hono'
import { html, raw } from 'hono/html'

import packageJSON from '#package.json' with { type: 'json' }

const getScalarConfig = (baseUrl: string) =>
	({
		hideModels: true,
		layout: 'modern',
		telemetry: false,
		url: '/openapi.json',
		slug: packageJSON.name,
		hideClientButton: true,
		title: packageJSON.name,
		showDeveloperTools: 'never',
		documentDownloadType: 'json',
		operationTitleSource: 'path',
		proxyUrl: 'https://proxy.scalar.com',
		favicon: 'https://explore.tempo.xyz/favicon.ico',
		sources: [{ url: '/openapi.json', default: true }],
		defaultHttpClient: { clientKey: 'curl', targetKey: 'shell' },
		servers: [
			{ url: baseUrl, description: 'Current' },
			{ url: 'https://contracts.tempo.xyz', description: 'Production' },
			{
				url: 'https://contracts.porto.workers.dev',
				description: 'workers.dev',
			},
			{
				url: 'http://localhost:{port}',
				description: 'Local',
				variables: {
					port: { default: '6767', description: 'localhost port number' },
				},
			},
		],
	}) as const

const renderDocs = (props: { baseUrl: string }) => {
	const scalarConfig = getScalarConfig(props.baseUrl)
	return html`<!doctype html>
<html lang="en">
  <head>
    <title>Contract Verification API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <main id="app"></main>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', ${raw(JSON.stringify(scalarConfig))})
    </script>
  </body>
</html>`
}

export const docsRoute = new Hono<{ Bindings: Cloudflare.Env }>().get(
	'/',
	(context) => context.html(renderDocs({ baseUrl: context.env.VITE_BASE_URL })),
)
