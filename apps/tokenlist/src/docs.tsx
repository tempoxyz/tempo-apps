import { renderApiReference } from '@scalar/client-side-rendering'

const html = renderApiReference({
	pageTitle: 'Tokenlist API',
	config: {
		url: '/schema/openapi.json',
		hideModels: true,
		hideClientButton: true,
		showDeveloperTools: 'never',
		documentDownloadType: 'json',
		operationTitleSource: 'path',
		slug: 'tokenlist',
		proxyUrl: 'https://proxy.scalar.com',
		favicon: 'https://explore.tempo.xyz/favicon.ico',
		_integration: 'hono',
	},
})

export const Docs = () =>
	new Response(html, {
		headers: { 'content-type': 'text/html; charset=utf-8' },
	})
