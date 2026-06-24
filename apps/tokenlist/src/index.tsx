import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { Docs } from '#docs.tsx'

import { CHAIN_IDS } from '#chains.ts'
import { OpenAPISpec, TokenList } from '#schema.ts'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.use('*', cors())

const staticAssetBindingError =
	'Static assets binding "ASSETS" is not configured.'

/** Base URL for the Tempo API. */
const tempoApiUrl = 'https://api.tempo.xyz'

type TokenInfo = {
	chainId: number
	address: string
	decimals: number
	name: string
	symbol: string
	logoURI?: string
}

type TempoToken = {
	address: string
	decimals: number
	name: string
	symbol: string
	logoUri?: string
}

/**
 * Fetches the chain's verified tokens from the Tempo API. Returns `null` when
 * the chain is unsupported or the request fails (callers map this to 404).
 */
async function fetchTokens(
	env: Cloudflare.Env,
	chainId: number,
): Promise<TokenInfo[] | null> {
	const url = new URL('/v1/tokens', tempoApiUrl)
	url.searchParams.set('chainId', String(chainId))
	url.searchParams.set('verified', 'true')
	url.searchParams.set('limit', String(200))

	const response = await fetch(url, {
		headers: env.TEMPO_API_KEY
			? { 'tempo-api-key': env.TEMPO_API_KEY }
			: undefined,
	})
	if (!response.ok) return null

	const body = (await response.json()) as { data?: TempoToken[] }
	if (!body.data) return null

	return body.data.map((token) => ({
		chainId,
		address: token.address,
		decimals: token.decimals,
		name: token.name,
		symbol: token.symbol,
		logoURI: token.logoUri,
	}))
}

const tokenIconExtensions = ['svg', 'png'] as const
const tokenIconContentTypes = {
	svg: 'image/svg+xml',
	png: 'image/png',
} satisfies Record<(typeof tokenIconExtensions)[number], string>

function getTokenIconBaseName(address: string): string {
	const lowercased = address.toLowerCase()
	for (const extension of tokenIconExtensions) {
		const suffix = `.${extension}`
		if (lowercased.endsWith(suffix)) return lowercased.slice(0, -suffix.length)
	}
	return lowercased
}

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

	const iconBaseName = getTokenIconBaseName(address)
	let assetResponse: Response | undefined
	let contentType = 'image/svg+xml'
	for (const extension of tokenIconExtensions) {
		const assetUrl = new URL(
			`/${chainId}/icons/${iconBaseName}.${extension}`,
			'http://assets',
		)
		const response = await assets.fetch(assetUrl)
		if (response.status === 200) {
			assetResponse = response
			contentType = tokenIconContentTypes[extension]
			break
		}
	}

	if (!assetResponse)
		assetResponse = await assets.fetch(
			new URL(`/${chainId}/icons/fallback.svg`, 'http://assets'),
		)

	// Let CF set correct headers; override only when missing
	const headers = new Headers(assetResponse.headers)
	if (!headers.has('Content-Type')) headers.set('Content-Type', contentType)

	return new Response(assetResponse.body, {
		status: assetResponse.status,
		headers,
	})
})

app.get('/list/:chain_id', async (context) => {
	const chainId = Number(context.req.param('chain_id'))
	if (!CHAIN_IDS.includes(chainId)) return context.notFound()

	const tokens = await fetchTokens(context.env, chainId)
	if (!tokens) return context.notFound()

	return context.json({ tokens })
})

// id could be symbol or address
app.get('/asset/:chain_id/:id', async (context) => {
	const id = context.req.param('id')
	const chainId = Number(context.req.param('chain_id'))

	if (!CHAIN_IDS.includes(chainId)) return context.notFound()

	const tokens = await fetchTokens(context.env, chainId)
	if (!tokens) return context.notFound()

	const asset = tokens.find(
		(token) =>
			token.symbol?.toLowerCase() === id.toLowerCase() ||
			token.address?.toLowerCase() === id.toLowerCase(),
	)

	if (!asset) return context.notFound()

	return context.json(asset)
})

app.get('/lists/all', async (context) => {
	const responses = await Promise.allSettled(
		CHAIN_IDS.map((chainId) => fetchTokens(context.env, chainId)),
	)

	const lists = responses
		.map((response) =>
			response.status === 'fulfilled' ? response.value : null,
		)
		.filter((tokens): tokens is TokenInfo[] => tokens !== null)
		.map((tokens) => ({ tokens }))

	return context.json(lists)
})

export default app satisfies ExportedHandler<Cloudflare.Env>
