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
	tokenOgQuerySchema,
	txOgQuerySchema,
} from '#params.ts'
import {
	AddressCard,
	type AddressData,
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

const DEVICE_PIXEL_RATIO = 1.0
const CACHE_TTL = 3600

const factory = createFactory<{ Bindings: Cloudflare.Env }>()

const rateLimiter = createMiddleware<{ Bindings: Cloudflare.Env }>(
	async (context, next) => {
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
		context.env.ASSETS.fetch(new URL('/og-explorer.webp', context.req.url)),
	)

// Apply rate limiting and caching (cache only in prod) to OG image routes
app.use('/tx/*', rateLimiter)
app.use('/token/*', rateLimiter)
app.use('/address/*', rateLimiter)
app.use('/explorer', rateLimiter)
app.use('*', except(isNotProd, cacheMiddleware))

/**
 * Transaction OG Image
 *
 * URL Parameters:
 * - hash: Transaction hash (0x...)
 * - block: Block number
 * - sender: Sender address (0x...)
 * - date: Date string (e.g., "12/01/2025")
 * - time: Time string (e.g., "18:32:21 GMT+0")
 * - fee: Fee amount (e.g., "-$0.013")
 * - feeToken: Token used for fee (e.g., "aUSD")
 * - feePayer: Address that paid fee (e.g., "0x8f5a...3bc3")
 * - total: Total display string (e.g., "-$1.55")
 * - ev1..ev6 (or e1..e6, event1..event6): Event strings in format "Action|Details|Amount" (optional 4th field: Message)
 */
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
	}

	const [fonts, images] = await Promise.all([
		loadFonts(),
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
			<div tw="absolute flex" style={{ left: '0', top: '40px' }}>
				<ReceiptCard
					data={receiptData}
					receiptLogo={toBase64DataUrl(images.receiptLogo)}
				/>
			</div>
		</div>,
		{
			width: 1200 * DEVICE_PIXEL_RATIO,
			height: 630 * DEVICE_PIXEL_RATIO,
			format: 'png',
			module,
			fonts: [
				{ weight: 400, name: 'GeistMono', data: fonts.mono, style: 'normal' },
				{ weight: 500, name: 'Inter', data: fonts.inter, style: 'normal' },
			],
		},
	)

	return new Response(imageResponse.body, {
		headers: { 'Content-Type': 'image/png' },
	})
})

/**
 * Token/Asset OG Image
 */
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
			loadFonts(),
			loadImages(context.env),
			tokenParams.chainId
				? fetchTokenIcon(address, tokenParams.chainId)
				: null,
		])

		const imageResponse = new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				<img
					src={toBase64DataUrl(images.bgToken)}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>
				<div tw="absolute flex" style={{ left: '0', top: '40px' }}>
					<TokenCard
						data={tokenData}
						icon={tokenIcon || toBase64DataUrl(images.nullIcon)}
					/>
				</div>
			</div>,
			{
				width: 1200 * DEVICE_PIXEL_RATIO,
				height: 630 * DEVICE_PIXEL_RATIO,
				format: 'png',
				module,
				fonts: [
					{ weight: 400, name: 'GeistMono', data: fonts.mono, style: 'normal' },
					{ weight: 500, name: 'Inter', data: fonts.inter, style: 'normal' },
				],
			},
		)

		return new Response(imageResponse.body, {
			headers: { 'Content-Type': 'image/png' },
		})
	},
)

/**
 * Address/Account OG Image
 */
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
		}

		const [fonts, images] = await Promise.all([
			loadFonts(),
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
				<div tw="absolute flex" style={{ left: '0', top: '40px' }}>
					<AddressCard data={addressData} />
				</div>
			</div>,
			{
				width: 1200 * DEVICE_PIXEL_RATIO,
				height: 630 * DEVICE_PIXEL_RATIO,
				format: 'png',
				module,
				fonts: [
					{ weight: 400, name: 'GeistMono', data: fonts.mono, style: 'normal' },
					{ weight: 500, name: 'Inter', data: fonts.inter, style: 'normal' },
				],
			},
		)

		return new Response(imageResponse.body, {
			headers: { 'Content-Type': 'image/png' },
		})
	},
)

export default app
