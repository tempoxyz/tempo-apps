import { Hono } from 'hono'
import { Scalar } from '@scalar/hono-api-reference'

import packageJSON from '#package.json' with { type: 'json' }

export const docsRoute = new Hono<{ Bindings: Cloudflare.Env }>().get(
	'/',
	(context) => {
		const baseUrl = context.env.VITE_BASE_URL
		return Scalar({
			hideModels: true,
			layout: 'modern',
			telemetry: false,
			url: '/openapi.json',
			slug: packageJSON.name,
			hideClientButton: true,
			pageTitle: packageJSON.name,
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
		})(context, async () => {})
	},
)
