import type { createApiReference } from '@scalar/api-reference'
import { Hono } from 'hono'
import { html, raw } from 'hono/html'

export const docsRoute = new Hono<{ Bindings: Cloudflare.Env }>()

const scalarConfig = {
	slug: 'contracts',
	hideModels: true,
	sources: [
		{
			url: 'https://sourcify.dev/server/api-docs/swagger.json',
			default: false,
		},
		{ url: '/openapi.json', default: true },
	],
	theme: 'default',
	telemetry: false,
	hideClientButton: true,
	showDeveloperTools: 'never',
	documentDownloadType: 'json',
	operationTitleSource: 'path',
	title: 'Contract Verification API Reference',
	favicon: 'https://explore.tempo.xyz/favicon.ico',
	// customCss: /* css */ ``,
} satisfies Parameters<typeof createApiReference>[1]

const Docs = () => {
	return (
		<html lang="en">
			<head>
				<title>Contract Verification API</title>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
			</head>
			<body>
				<main id="app"></main>
				<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
				<script>{html /* js */`Scalar.createApiReference('#app', ${raw(JSON.stringify(scalarConfig))})`}</script>
			</body>
		</html>
	)
}

docsRoute.get('/', (context) => context.html(<Docs />))
