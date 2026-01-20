import type { createApiReference } from '@scalar/api-reference'
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
} satisfies Parameters<typeof createApiReference>[1]

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
				<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
				<script>{html /* jsx */`Scalar.createApiReference('#app', ${raw(JSON.stringify(scalarConfig))})`}</script>
			</body>
		</html>
	)
}
