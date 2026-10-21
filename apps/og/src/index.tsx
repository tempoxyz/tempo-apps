import { zValidator } from '@hono/zod-validator'
import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { cache } from 'hono/cache'
import { except } from 'hono/combine'
import { createFactory, createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

import { Address } from 'ox'
import {
	fetchPortalOverview,
	type PortalNetwork,
	portalId,
	portalQuerySchema,
} from '#zone-portal.ts'
import { ZonePortalCard } from '#zone-portal-card.tsx'
import { Card, type Network, networkOf } from '#brand.tsx'

import {
	addressOgQuerySchema,
	blockOgQuerySchema,
	type TxOgQueryParams,
	tokenOgQuerySchema,
	txOgQuerySchema,
} from '#params.ts'
import {
	AddressCard,
	type AddressData,
	BlockCard,
	type BlockData,
	HomeCard,
	ListingCard,
	ReceiptCard,
	type ReceiptData,
	TokenCard,
	type TokenData,
} from '#ui.tsx'
import {
	fetchTokenIcon,
	type Images,
	isBlockId,
	isTxHash,
	loadFonts,
	loadImages,
} from '#utilities.ts'

const CACHE_TTL = 3600

const factory = createFactory<{ Bindings: Cloudflare.Env }>()

const rateLimiter = createMiddleware<{ Bindings: Cloudflare.Env }>(
	async (context, next) => {
		if (!context.env.REQUESTS_RATE_LIMITER) return next()

		const { success } = await context.env.REQUESTS_RATE_LIMITER.limit({
			key: 'global',
		})
		if (!success)
			throw new HTTPException(429, { message: 'Rate limit exceeded' })

		return next()
	},
)

const isNotProd = (c: { req: { url: string } }) =>
	new URL(c.req.url).hostname !== 'og.tempo.xyz'

const cacheMiddleware = cache({
	cacheName: 'og-images',
	cacheControl: `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
})

const app = factory.createApp()

app.onError((error, context) => {
	if (error instanceof HTTPException) return error.getResponse()

	console.error('Unexpected error:', error)
	return context.text('Internal Server Error', 500)
})

app.get('/favicon.ico', (context) =>
	context.redirect('https://docs.tempo.xyz/icon-light.png'),
)

app
	.get('/', (context) => context.text('OK'))
	.get('/health', (context) => context.text('OK'))
// Apply rate limiting and caching (cache only in prod) to OG image routes
app.use('/tx/*', rateLimiter)
app.use('/tx', rateLimiter)
app.use('/token/*', rateLimiter)
app.use('/address/*', rateLimiter)
app.use('/zone-portal/*', rateLimiter)
app.use('/receipt/*', rateLimiter)
app.use('/block/*', rateLimiter)
app.use('/blocks', rateLimiter)
app.use('/tokens', rateLimiter)
app.use('/explorer', rateLimiter)
app.use('*', except(isNotProd, cacheMiddleware))

/** Renders a 1200 × 630 WebP with the bundled fonts. */
async function render(
	env: Cloudflare.Env,
	card: (images: Images) => ReturnType<typeof Card>,
): Promise<ImageResponse> {
	const [fonts, images] = await Promise.all([loadFonts(env), loadImages(env)])
	return new ImageResponse(card(images), {
		width: 1200,
		height: 630,
		format: 'webp',
		module,
		fonts,
	})
}

const PORTAL_NETWORKS: Record<PortalNetwork, Network> = {
	mainnet: 'Mainnet',
	testnet: 'Testnet',
	devnet: 'Devnet',
	nextfork: 'Nextfork',
}

app.get(
	'/zone-portal/:address',
	zValidator('query', portalQuerySchema),
	async (context) => {
		const address = context.req.param('address')
		if (portalId(address) === undefined)
			throw new HTTPException(400, { message: 'Invalid Zone Portal address' })
		const { network } = context.req.valid('query')
		let dataError = ''
		const [overview] = await Promise.all([
			fetchPortalOverview(address, network).catch((error) => {
				console.error('Zone Portal OG data unavailable:', error)
				dataError =
					error instanceof Error && typeof error.cause === 'number'
						? `http-${error.cause}`
						: error instanceof Error && error.name === 'ZodError'
							? 'invalid-response'
							: error instanceof Error && error.name === 'TimeoutError'
								? 'timeout'
								: 'network-error'
				return undefined
			}),
			loadFonts(context.env),
			loadImages(context.env),
		])
		const response = await render(context.env, (images) => (
			<Card logo={images.logo} network={PORTAL_NETWORKS[network]}>
				<ZonePortalCard address={address} overview={overview} />
			</Card>
		))
		return new Response(response.body, {
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': overview
					? 'public, max-age=60, s-maxage=60'
					: 'no-store',
				'X-Portal-Data': overview ? 'available' : 'unavailable',
				...(dataError ? { 'X-Portal-Data-Error': dataError } : {}),
			},
		})
	},
)

// Preserve old share-image URLs without serving the baked-in legacy design.
for (const [path, destination] of [
	['/bg-default.webp', '/explorer'],
	['/og-blocks.webp', '/blocks'],
	['/bg-list-blocks.webp', '/blocks'],
	['/og-tokens.webp', '/tokens'],
	['/bg-list-tokens.webp', '/tokens'],
	['/og-transactions.webp', '/tx'],
] as const) {
	app.get(path, (context) => context.redirect(destination.slice(1), 302))
}

// Dynamic OG image routes

async function receiptData(
	hash: string,
	txParams: TxOgQueryParams,
): Promise<ReceiptData> {
	const icons: Record<string, string> = {}
	const { chainId } = txParams
	// Logos appear only in a single action's sentence; several actions show as tags.
	const single =
		!txParams.eventsFailed &&
		Math.max(txParams.eventCount, txParams.events.length) === 1
	if (chainId && single)
		await Promise.all(
			[...new Set(txParams.events[0]?.tokens ?? [])].map(async (token) => {
				const icon = await fetchTokenIcon(token, chainId)
				if (icon) icons[token] = icon
			}),
		)
	return {
		icons,
		eventCount: txParams.eventCount,
		hash,
		blockNumber: txParams.block,
		sender: txParams.sender,
		date: txParams.date,
		time: txParams.time,
		fee: txParams.fee,
		feeToken: txParams.feeToken,
		feePayer: txParams.feePayer,
		total: txParams.total,
		events: txParams.events,
		eventsFailed: txParams.eventsFailed,
		status: txParams.status,
	}
}

for (const [path, title] of [
	['/tx/:hash', 'Transaction'],
	['/receipt/:hash', 'Receipt'],
] as const)
	app.get(path, zValidator('query', txOgQuerySchema), async (context) => {
		const hash = context.req.param('hash')
		if (!isTxHash(hash))
			throw new HTTPException(400, { message: 'Invalid transaction hash' })

		const txParams = context.req.valid('query')
		const [data] = await Promise.all([
			receiptData(hash, txParams),
			loadFonts(context.env),
			loadImages(context.env),
		])
		const imageResponse = await render(context.env, (images) => (
			<Card logo={images.logo} network={networkOf(txParams.chainId)}>
				<ReceiptCard data={data} title={title} />
			</Card>
		))

		return new Response(imageResponse.body, {
			headers: { 'Content-Type': 'image/webp' },
		})
	})

app.get(
	'/block/:id',
	zValidator('query', blockOgQuerySchema),
	async (context) => {
		const id = context.req.param('id')
		if (!isBlockId(id))
			throw new HTTPException(400, { message: 'Invalid block id' })

		const blockParams = context.req.valid('query')
		const blockData: BlockData = {
			id,
			number: blockParams.number,
			timestamp: blockParams.timestamp,
			unixTimestamp: blockParams.unixTimestamp,
			txCount: blockParams.txCount,
			miner: blockParams.miner,
			parentHash: blockParams.parentHash,
			gasUsage: blockParams.gasUsage,
			prevBlockTxCounts: blockParams.prevBlocks,
		}

		const imageResponse = await render(context.env, (images) => (
			<Card logo={images.logo}>
				<BlockCard data={blockData} />
			</Card>
		))

		return new Response(imageResponse.body, {
			headers: { 'Content-Type': 'image/webp' },
		})
	},
)

app.get(
	'/token/:address',
	zValidator('query', tokenOgQuerySchema),
	async (context) => {
		const address = context.req.param('address')
		if (!Address.validate(address)) {
			throw new HTTPException(400, { message: 'Invalid token address' })
		}

		const tokenParams = context.req.valid('query')
		const tokenData: TokenData = { address, ...tokenParams }

		const [tokenIcon] = await Promise.all([
			tokenParams.chainId ? fetchTokenIcon(address, tokenParams.chainId) : null,
			loadFonts(context.env),
			loadImages(context.env),
		])
		const imageResponse = await render(context.env, (images) => (
			<Card logo={images.logo} network={networkOf(tokenParams.chainId)}>
				<TokenCard data={tokenData} icon={tokenIcon} />
			</Card>
		))

		const body = await imageResponse.arrayBuffer()
		return new Response(body, {
			headers: { 'Content-Type': 'image/webp' },
		})
	},
)

app.get(
	'/address/:address',
	zValidator('query', addressOgQuerySchema),
	async (context) => {
		const address = context.req.param('address')
		if (!Address.validate(address)) {
			throw new HTTPException(400, { message: 'Invalid address' })
		}

		const addrParams = context.req.valid('query')
		const addressData: AddressData = {
			address,
			holdings: addrParams.holdings,
			txCount: addrParams.txCount,
			lastActive: addrParams.lastActive,
			created: addrParams.created,
			feeToken: addrParams.feeToken,
			tokensHeld: addrParams.tokens,
			accountType: addrParams.accountType,
			methods: addrParams.methods,
			deployer: addrParams.deployer,
			contractName: addrParams.contractName,
			contractDescription: addrParams.contractDescription,
		}

		const imageResponse = await render(context.env, (images) => (
			<Card logo={images.logo}>
				<AddressCard data={addressData} />
			</Card>
		))

		return new Response(imageResponse.body, {
			headers: { 'Content-Type': 'image/webp' },
		})
	},
)

app.get('/explorer', (context) =>
	render(context.env, (images) => (
		<HomeCard logo={images.logo} search={images.icons.search} />
	)),
)

// Listing and fallback cards share the detail cards' frame.
for (const [path, title, subtitle, icon] of [
	['/blocks', 'Blocks', 'The latest blocks produced on Tempo', 'blocks'],
	['/tokens', 'Tokens', 'Stablecoins and tokens issued on Tempo', 'tokens'],
	[
		'/tx',
		'Transactions',
		'Payments and transactions settled on Tempo',
		'transactions',
	],
] as const) {
	app.get(path, (context) =>
		render(context.env, (images) => (
			<Card logo={images.logo}>
				<ListingCard
					title={title}
					subtitle={subtitle}
					icon={images.icons[icon]}
				/>
			</Card>
		)),
	)
}

export default app
