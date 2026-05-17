import { Hono } from 'hono'
import { renderApiReference } from '@scalar/client-side-rendering'

import packageJSON from '#package.json' with { type: 'json' }

export const docsRoute = new Hono<{ Bindings: Cloudflare.Env }>().get(
	'/',
	(context) => {
		const html = renderApiReference({
			pageTitle: packageJSON.name,
			config: {
				hideModels: true,
				layout: 'modern',
				telemetry: false,
				url: '/openapi.json',
				slug: packageJSON.name,
				hideClientButton: true,
				showDeveloperTools: 'never',
				documentDownloadType: 'json',
				operationTitleSource: 'path',
				proxyUrl: 'https://proxy.scalar.com',
				favicon: 'https://explore.tempo.xyz/favicon.ico',
				sources: [{ url: '/openapi.json', default: true }],
				defaultHttpClient: { clientKey: 'curl', targetKey: 'shell' },
				servers: [
					{ url: context.env.VITE_BASE_URL, description: 'Current' },
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
				_integration: 'hono',
			},
		})
		return context.html(html)
	},
)
