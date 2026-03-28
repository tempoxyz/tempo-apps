import { zValidator } from '@hono/zod-validator'
import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { cache } from 'hono/cache'
import { except } from 'hono/combine'
import { createFactory, createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

import { Address } from 'ox'

import {
	addressOgQuerySchema,
	blockOgQuerySchema,
	tokenOgQuerySchema,
	txOgQuerySchema,
} from '#params.ts'
import {
	AddressCard,
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
	.get('/explorer', (context) =>
		context.env.ASSETS.fetch(new URL('/bg-default.webp', context.req.url)),
	)
	.get('/blocks', (context) =>
		context.env.ASSETS.fetch(new URL('/og-blocks.webp', context.req.url)),
	)
	.get('/tokens', (context) =>
		context.env.ASSETS.fetch(new URL('/og-tokens.webp', context.req.url)),
	)
// Apply rate limiting and caching (cache only in prod) to OG image routes
app.use('/tx/*', rateLimiter)
app.use('/tx', rateLimiter)
app.use('/token/*', rateLimiter)
app.use('/address/*', rateLimiter)
app.use('/receipt/*', rateLimiter)
app.use('/block/*', rateLimiter)
app.use('/blocks', rateLimiter)
app.use('/tokens', rateLimiter)
app.use('/explorer', rateLimiter)
app.use('/blocks', rateLimiter)
app.use('/tokens', rateLimiter)
app.use('*', except(isNotProd, cacheMiddleware))

// Dynamic OG image routes

app.get('/tx/:hash', zValidator('query', txOgQuerySchema), async (context) => {
	const hash = context.req.param('hash')
	if (!isTxHash(hash))
		throw new HTTPException(400, { message: 'Invalid transaction hash' })

	const txParams = context.req.valid('query')
	const receiptData: ReceiptData = {
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
		<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
			<img
				src={toBase64DataUrl(images.bgTx)}
				alt=""
				tw="absolute inset-0 w-full h-full"
				style={{ objectFit: 'cover' }}
			/>
			<div tw="absolute flex items-end" style={{ left: '0', bottom: '0' }}>
				<ReceiptCard data={receiptData} />
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
			format: 'webp',
			module,
			fonts: [
				{
					weight: 400,
					name: 'GeistMono',
					data: fonts.mono,
					style: 'normal',
				},
				{ weight: 500, name: 'Inter', data: fonts.inter, style: 'normal' },
				{
					weight: 400,
					name: 'Pilat',
					data: fonts.pilat,
					style: 'normal',
				},
			],
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
		const receiptData: ReceiptData = {
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
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				<img
					src={toBase64DataUrl(images.bgReceipt)}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>
				<div tw="absolute flex items-end" style={{ left: '0', bottom: '0' }}>
					<ReceiptCard data={receiptData} />
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				format: 'webp',
				module,
				fonts: [
					{
						weight: 400,
						name: 'GeistMono',
						data: fonts.mono,
						style: 'normal',
					},
					{
						weight: 500,
						name: 'Inter',
						data: fonts.inter,
						style: 'normal',
					},
					{
						weight: 400,
						name: 'Pilat',
						data: fonts.pilat,
						style: 'normal',
					},
				],
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
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				<img
					src={toBase64DataUrl(images.bgBlock)}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>
				<div tw="absolute flex items-end" style={{ left: '0', bottom: '0' }}>
					<BlockCard data={blockData} />
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				format: 'webp',
				module,
				fonts: [
					{
						weight: 400,
						name: 'GeistMono',
						data: fonts.mono,
						style: 'normal',
					},
					{
						weight: 500,
						name: 'Inter',
						data: fonts.inter,
						style: 'normal',
					},
					{
						weight: 400,
						name: 'Pilat',
						data: fonts.pilat,
						style: 'normal',
					},
				],
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
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				<img
					src={toBase64DataUrl(images.bgToken)}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>
				<div tw="absolute flex items-end" style={{ left: '0', bottom: '0' }}>
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
				fonts: [
					{
						weight: 400,
						name: 'GeistMono',
						data: fonts.mono,
						style: 'normal',
					},
					{
						weight: 500,
						name: 'Inter',
						data: fonts.inter,
						style: 'normal',
					},
					{
						weight: 400,
						name: 'Pilat',
						data: fonts.pilat,
						style: 'normal',
					},
				],
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
		}

		const [fonts, images] = await Promise.all([
			loadFonts(context.env),
			loadImages(context.env),
		])

		const bgImage =
			addressData.accountType === 'contract'
				? images.bgContract
				: images.bgAddress

		const imageResponse = new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				<img
					src={toBase64DataUrl(bgImage)}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>
				<div tw="absolute flex items-end" style={{ left: '0', bottom: '0' }}>
					<AddressCard data={addressData} />
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				format: 'webp',
				module,
				fonts: [
					{
						weight: 400,
						name: 'GeistMono',
						data: fonts.mono,
						style: 'normal',
					},
					{
						weight: 500,
						name: 'Inter',
						data: fonts.inter,
						style: 'normal',
					},
					{
						weight: 400,
						name: 'Pilat',
						data: fonts.pilat,
						style: 'normal',
					},
				],
			},
		)

		return new Response(imageResponse.body, {
			headers: { 'Content-Type': 'image/webp' },
		})
	},
)

// Static listing OG images

app.get('/blocks', (context) =>
	context.env.ASSETS.fetch(new URL('/bg-list-blocks.webp', context.req.url)),
)

app.get('/tokens', (context) =>
	context.env.ASSETS.fetch(new URL('/bg-list-tokens.webp', context.req.url)),
)

export default app
