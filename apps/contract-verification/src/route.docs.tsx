import { Hono } from 'hono'
import { html, raw } from 'hono/html'

export const docsRoute = new Hono<{ Bindings: Cloudflare.Env }>()

const scalarConfig = {
	slug: 'contracts',
	hideModels: true,
	hideClientButton: true,
	url: '/openapi.json',
	showDeveloperTools: 'never',
	documentDownloadType: 'json',
	operationTitleSource: 'path',
	title: 'Contract Verification API Reference',
	proxyUrl: 'https://proxy.scalar.com',
	favicon: 'https://explore.tempo.xyz/favicon.ico',
}

const Docs = () => {
	return (
		<html lang="en">
			<head>
				<title>Contract Verification API</title>
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

docsRoute.get('/', (context) => context.html(<Docs />))
