import { html, raw } from 'hono/html'

const scalarConfig = {
	slug: 'tokenlist',
	hideModels: true,
	sources: [{ url: '/schema/openapi.json', default: true }],
	hideClientButton: true,
	url: '/schema/openapi.json',
	showDeveloperTools: 'never',
	documentDownloadType: 'json',
	operationTitleSource: 'path',
	title: 'Tokenlist API Reference',
	proxyUrl: 'https://proxy.scalar.com',
	favicon: 'https://explore.tempo.xyz/favicon.ico',
} as const

export const Docs = () => {
	return (
		<html lang="en">
			<head>
				<title>Tokenlist API</title>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
			</head>
			<body>
				{/** biome-ignore lint/correctness/useUniqueElementIds: _ */}
				<main id="app"></main>
				<script
					src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.4/dist/browser/standalone.js"
					integrity="sha384-hwB9WroDTpZaI38gr+u9CXA6ksz5gUYgD2GxXazKl/agT1L2GWUiRFWGJYNiFu4Q"
					crossorigin="anonymous"
				></script>
				<script>{html /* jsx */`Scalar.createApiReference('#app', ${raw(JSON.stringify(scalarConfig))})`}</script>
			</body>
		</html>
	)
}
