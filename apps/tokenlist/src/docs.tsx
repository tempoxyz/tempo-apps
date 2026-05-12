import { Scalar } from '@scalar/hono-api-reference'

export const Docs = Scalar({
	pageTitle: 'Tokenlist API',
	url: '/schema/openapi.json',
	hideModels: true,
	hideClientButton: true,
	showDeveloperTools: 'never',
	documentDownloadType: 'json',
	operationTitleSource: 'path',
	slug: 'tokenlist',
	proxyUrl: 'https://proxy.scalar.com',
	favicon: 'https://explore.tempo.xyz/favicon.ico',
})
