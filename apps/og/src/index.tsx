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
	portalId,
	portalQuerySchema,
} from '#zone-portal.ts'
import { ZonePortalCard } from '#zone-portal-card.tsx'
import { CardBackground, ListingCard, ReceiptBackground } from '#brand.tsx'

import {
	addressOgQuerySchema,
	blockOgQuerySchema,
	tokenOgQuerySchema,
	txOgQuerySchema,
} from '#params.ts'
import {
	AddressCard,
	AddressImage,
	type AddressData,
	BlockCard,
	type BlockData,
	ReceiptCard,
	type ReceiptData,
	TokenCard,
	type TokenData,
} from '#ui.tsx'
import {
	fetchTokenIcon,
	isTxHash,
	loadFonts,
	loadImages,
	toBase64DataUrl,
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

app.get(
	'/zone-portal/:address',
	zValidator('query', portalQuerySchema),
	async (context) => {
		const address = context.req.param('address')
		if (portalId(address) === undefined)
			throw new HTTPException(400, { message: 'Invalid Zone Portal address' })
		const { network } = context.req.valid('query')
		let dataError = ''
		const [fonts, images, overview] = await Promise.all([
			loadFonts(context.env),
			loadImages(context.env),
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
		])
		const response = new ImageResponse(
			<AddressImage
				artwork={toBase64DataUrl(images.receiptRings)}
				logo={toBase64DataUrl(images.tempoLockup, 'image/svg+xml')}
			>
				<ZonePortalCard address={address} overview={overview} />
			</AddressImage>,
			{
				width: 1200,
				height: 630,
				format: 'webp',
				module,
				fonts,
			},
		)
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

app.get('/tx/:hash', zValidator('query', txOgQuerySchema), async (context) => {
	const hash = context.req.param('hash')
	if (!isTxHash(hash))
		throw new HTTPException(400, { message: 'Invalid transaction hash' })

	const txParams = context.req.valid('query')
	const icons: Record<string, string> = {}
	if (txParams.chainId)
		await Promise.all(
			[
				...new Set(
					txParams.events.slice(0, 3).flatMap((event) => event.tokens ?? []),
				),
			].map(async (token) => {
				const icon = await fetchTokenIcon(token, txParams.chainId!)
				if (icon) icons[token] = icon
			}),
		)
	const receiptData: ReceiptData = {
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

	const [fonts, images] = await Promise.all([
		loadFonts(context.env),
		loadImages(context.env),
	])

	const imageResponse = new ImageResponse(
		<div
			tw="flex w-full h-full relative"
			style={{
				fontFamily: 'Pilat',
				color: '#181818',
				backgroundColor: '#fafafa',
			}}
		>
			<ReceiptBackground
				logo={toBase64DataUrl(images.tempoLockup, 'image/svg+xml')}
				artwork={toBase64DataUrl(images.receiptRings)}
			/>
			<div tw="absolute flex items-end" style={{ left: '0px', bottom: '0px' }}>
				<ReceiptCard data={receiptData} />
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
			format: 'webp',
			module,
			fonts,
		},
	)

	return new Response(imageResponse.body, {
		headers: { 'Content-Type': 'image/webp' },
	})
})

app.get(
	'/receipt/:hash',
	zValidator('query', txOgQuerySchema),
	async (context) => {
		const hash = context.req.param('hash')
		if (!isTxHash(hash))
			throw new HTTPException(400, { message: 'Invalid transaction hash' })

		const txParams = context.req.valid('query')
		const icons: Record<string, string> = {}
		if (txParams.chainId)
			await Promise.all(
				[
					...new Set(
						txParams.events.slice(0, 3).flatMap((event) => event.tokens ?? []),
					),
				].map(async (token) => {
					const icon = await fetchTokenIcon(token, txParams.chainId!)
					if (icon) icons[token] = icon
				}),
			)
		const receiptData: ReceiptData = {
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

		const [fonts, images] = await Promise.all([
			loadFonts(context.env),
			loadImages(context.env),
		])

		const imageResponse = new ImageResponse(
			<div
				tw="flex w-full h-full relative"
				style={{
					fontFamily: 'Pilat',
					color: '#181818',
					backgroundColor: '#fafafa',
				}}
			>
				<ReceiptBackground
					logo={toBase64DataUrl(images.tempoLockup, 'image/svg+xml')}
					artwork={toBase64DataUrl(images.receiptRings)}
				/>
				<div
					tw="absolute flex items-end"
					style={{ left: '0px', bottom: '0px' }}
				>
					<ReceiptCard data={receiptData} />
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				format: 'webp',
				module,
				fonts,
			},
		)

		return new Response(imageResponse.body, {
			headers: { 'Content-Type': 'image/webp' },
		})
	},
)

app.get(
	'/block/:id',
	zValidator('query', blockOgQuerySchema),
	async (context) => {
		const blockParams = context.req.valid('query')
		const blockData: BlockData = {
			number: blockParams.number,
			timestamp: blockParams.timestamp,
			unixTimestamp: blockParams.unixTimestamp,
			txCount: blockParams.txCount,
			miner: blockParams.miner,
			parentHash: blockParams.parentHash,
			gasUsage: blockParams.gasUsage,
			prevBlockTxCounts: blockParams.prevBlocks,
		}

		const [fonts, images] = await Promise.all([
			loadFonts(context.env),
			loadImages(context.env),
		])

		const imageResponse = new ImageResponse(
			<div
				tw="flex w-full h-full relative"
				style={{
					fontFamily: 'Pilat',
					color: '#181818',
					backgroundColor: '#fafafa',
				}}
			>
				<CardBackground
					artwork={toBase64DataUrl(images.receiptRings)}
					title="Block"
					logo={toBase64DataUrl(images.tempoLockup, 'image/svg+xml')}
				/>
				<div
					tw="absolute flex items-end"
					style={{ left: '0px', bottom: '0px' }}
				>
					<BlockCard data={blockData} />
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				format: 'webp',
				module,
				fonts,
			},
		)

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

		const [fonts, images, tokenIcon] = await Promise.all([
			loadFonts(context.env),
			loadImages(context.env),
			tokenParams.chainId ? fetchTokenIcon(address, tokenParams.chainId) : null,
		])

		const imageResponse = new ImageResponse(
			<div
				tw="flex w-full h-full relative"
				style={{
					fontFamily: 'Pilat',
					color: '#181818',
					backgroundColor: '#fafafa',
				}}
			>
				<CardBackground
					artwork={toBase64DataUrl(images.receiptRings)}
					title="Token"
					logo={toBase64DataUrl(images.tempoLockup, 'image/svg+xml')}
				/>
				<div
					tw="absolute flex items-end"
					style={{ left: '0px', bottom: '0px' }}
				>
					<TokenCard
						data={tokenData}
						icon={tokenIcon || toBase64DataUrl(images.nullIcon)}
					/>
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				format: 'webp',
				module,
				fonts,
			},
		)

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

		const [fonts, images] = await Promise.all([
			loadFonts(context.env),
			loadImages(context.env),
		])

		const imageResponse = new ImageResponse(
			<div
				tw="flex w-full h-full relative"
				style={{
					fontFamily: 'Pilat',
					color: '#181818',
					backgroundColor: '#fafafa',
				}}
			>
				<CardBackground
					artwork={toBase64DataUrl(images.receiptRings)}
					title={
						addressData.accountType === 'contract' ? 'Contract' : 'Account'
					}
					logo={toBase64DataUrl(images.tempoLockup, 'image/svg+xml')}
				/>
				<div
					tw="absolute flex items-end"
					style={{ left: '0px', bottom: '0px' }}
				>
					<AddressCard data={addressData} />
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				format: 'webp',
				module,
				fonts,
			},
		)

		return new Response(imageResponse.body, {
			headers: { 'Content-Type': 'image/webp' },
		})
	},
)

// Listing and fallback cards use the same renderer as detail cards.
for (const [path, title, subtitle] of [
	['/explorer', 'Search. Explore. Discover.', 'Tempo Explorer'],
	['/blocks', 'Blocks', 'Explore activity on Tempo'],
	['/tokens', 'Tokens', 'Explore assets on Tempo'],
	['/tx', 'Transactions', 'Explore payments on Tempo'],
] as const) {
	app.get(path, async (context) => {
		const [fonts, images] = await Promise.all([
			loadFonts(context.env),
			loadImages(context.env),
		])
		return new ImageResponse(
			<ListingCard
				artwork={toBase64DataUrl(images.receiptRings)}
				title={title}
				subtitle={subtitle}
				logo={toBase64DataUrl(images.tempoLockup, 'image/svg+xml')}
			/>,
			{ width: 1200, height: 630, format: 'webp', module, fonts },
		)
	})
}

export default app
