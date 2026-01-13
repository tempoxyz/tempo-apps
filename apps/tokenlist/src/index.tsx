import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Docs } from '#docs.tsx'

import { CHAIN_IDS } from '#chains.ts'
import { OpenAPISpec, TokenList } from '#schema.ts'
import type { TokenListSchema } from '#tokenlist.types.ts'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.use('*', cors())

const staticAssetBindingError =
	'Static assets binding "ASSETS" is not configured.'

app
	.get('/', (context) => context.redirect('/docs'))
	.get('/health', (_context) => new Response('ok'))
	.get('/docs', async (context) => context.html(<Docs />))
	.get('/version', async (context) =>
		context.json({
			timestamp: Date.now(),
			source: 'https://github.com/tempoxyz/tempo-apps',
			rev: __BUILD_VERSION__,
			chains: CHAIN_IDS,
		}),
	)

app
	.get('/schema/openapi', async (context) => context.json(OpenAPISpec))
	.get('/schema/openapi.json', async (context) => context.json(OpenAPISpec))
	.get('/schema/tokenlist', async (context) => context.json(TokenList))
	.get('/schema/tokenlist.json', async (context) => context.json(TokenList))

app.get('/icon/:chain_id', async (context) => {
	const chainId = context.req.param('chain_id')
	if (!CHAIN_IDS.includes(Number(chainId))) return context.notFound()

	const assets = context.env.ASSETS
	if (!assets)
		return new Response(staticAssetBindingError, {
			status: 500,
		})

	const assetUrl = new URL(`/${chainId}/icon.svg`, 'http://assets')
	const assetResponse = await assets.fetch(assetUrl)

	if (assetResponse.status === 404) return context.notFound()

	// Let CF set correct headers; override only when missing
	const headers = new Headers(assetResponse.headers)
	if (!headers.has('Content-Type')) headers.set('Content-Type', 'image/svg+xml')

	return new Response(assetResponse.body, {
		status: assetResponse.status,
		headers,
	})
})

app.get('/icon/:chain_id/:address', async (context) => {
	const address = context.req.param('address')
	const chainId = context.req.param('chain_id')

	if (!CHAIN_IDS.includes(Number(chainId))) return context.notFound()

	const assets = context.env.ASSETS
	if (!assets) return new Response(staticAssetBindingError, { status: 500 })

	const assetUrl = new URL(
		`/${chainId}/icons/${address.toLowerCase().replace('.svg', '')}.svg`,
		'http://assets',
	)
	let assetResponse = await assets.fetch(assetUrl)

	if (assetResponse.status !== 200)
		assetResponse = await assets.fetch(
			new URL(`/${chainId}/icons/fallback.svg`, 'http://assets'),
		)

	// Let CF set correct headers; override only when missing
	const headers = new Headers(assetResponse.headers)
	if (!headers.has('Content-Type')) headers.set('Content-Type', 'image/svg+xml')

	return new Response(assetResponse.body, {
		status: assetResponse.status,
		headers,
	})
})

app.get('/list/:chain_id', async (context) => {
	const chainId = context.req.param('chain_id')
	if (!CHAIN_IDS.includes(Number(chainId))) return context.notFound()

	const assets = context.env.ASSETS
	if (!assets) return new Response(staticAssetBindingError, { status: 500 })

	const assetUrl = new URL(`/${chainId}/tokenlist.json`, 'http://assets')
	const assetResponse = await assets.fetch(assetUrl)

	if (assetResponse.status === 404) return context.notFound()

	const list = await assetResponse.json()
	if (!list) return context.notFound()

	return context.json(list)
})

// id could be symbol or address
app.get('/asset/:chain_id/:id', async (context) => {
	const id = context.req.param('id')
	const chainId = context.req.param('chain_id')

	if (!CHAIN_IDS.includes(Number(chainId))) return context.notFound()

	const assets = context.env.ASSETS
	if (!assets) return new Response(staticAssetBindingError, { status: 500 })

	const assetUrl = new URL(`/${chainId}/tokenlist.json`, 'http://assets')
	const assetResponse = await assets.fetch(assetUrl)

	if (assetResponse.status === 404) return context.notFound()

	const list = (await assetResponse.json()) as TokenListSchema
	if (!list) return context.notFound()

	const asset = list.tokens?.find(
		(token) =>
			token.symbol?.toLowerCase() === id.toLowerCase() ||
			token.address?.toLowerCase() === id.toLowerCase(),
	)

	if (!asset) return context.notFound()

	return context.json(asset)
})

app.get('/lists/all', async (context) => {
	const assets = context.env.ASSETS
	if (!assets) return new Response(staticAssetBindingError, { status: 500 })

	const responses = await Promise.allSettled(
		CHAIN_IDS.map((chainId) =>
			assets
				.fetch(new URL(`/${chainId}/tokenlist.json`, 'http://assets'))
				.then((response) => response.json())
				.then((list) => ({ chainId, list })),
		),
	)

	const fulfilled = responses
		.map((response) =>
			response.status === 'fulfilled' ? response.value.list : null,
		)
		.filter((list): list is TokenListSchema => list !== null)

	return context.json(fulfilled)
})

export default app satisfies ExportedHandler<Cloudflare.Env>
