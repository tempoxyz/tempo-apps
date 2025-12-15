import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { createFactory, createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { Address, Hex } from 'ox'

import {
	parseAddressOgParams,
	parseTokenOgParams,
	parseTxOgParams,
} from '#params.ts'
import {
	AddressCard,
	type AddressData,
	ReceiptCard,
	type ReceiptData,
	TokenCard,
	type TokenData,
} from './ui.tsx'

// ============ Constants ============

const FONT_MONO_URL =
	'https://unpkg.com/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2'
const FONT_INTER_URL =
	'https://unpkg.com/@fontsource/inter/files/inter-latin-500-normal.woff2'
const TOKENLIST_ICON_URL = 'https://tokenlist.tempo.xyz/icon'
const TESTNET_CHAIN_ID = 42429
const DEVICE_PIXEL_RATIO = 1.0
const CACHE_TTL = 3600

// ============ Helpers ============

const isTxHash = (value: string): boolean =>
	Hex.validate(value) && Hex.size(value as Hex.Hex) === 32

const shouldCache = (hostname: string): boolean => hostname === 'og.tempo.xyz'

const toBase64DataUrl = (data: ArrayBuffer, mime = 'image/webp'): string =>
	`data:${mime};base64,${Buffer.from(data).toString('base64')}`

// ============ Global Asset Cache ============

let fontCache: { mono: ArrayBuffer; inter: ArrayBuffer } | null = null
let fontsInFlight: Promise<{ mono: ArrayBuffer; inter: ArrayBuffer }> | null =
	null

interface ImageCache {
	bgTx: ArrayBuffer
	bgToken: ArrayBuffer
	bgAddress: ArrayBuffer
	bgContract: ArrayBuffer
	receiptLogo: ArrayBuffer
	nullIcon: ArrayBuffer
}

let imageCache: ImageCache | null = null
let imagesInFlight: Promise<ImageCache> | null = null

async function loadFonts() {
	if (fontCache) return fontCache
	if (!fontsInFlight) {
		fontsInFlight = Promise.all([
			fetch(FONT_MONO_URL).then((r) => r.arrayBuffer()),
			fetch(FONT_INTER_URL).then((r) => r.arrayBuffer()),
		]).then(([mono, inter]) => {
			fontCache = { mono, inter }
			fontsInFlight = null
			return fontCache
		})
	}
	return fontsInFlight
}

async function loadImages(env: Cloudflare.Env): Promise<ImageCache> {
	if (imageCache) return imageCache
	if (!imagesInFlight) {
		imagesInFlight = (async () => {
			const [bgTx, bgToken, bgAddress, bgContract, receiptLogo, nullIcon] =
				await Promise.all([
					env.ASSETS.fetch(
						new Request('https://assets/bg-template-transaction.webp'),
					).then((r) => r.arrayBuffer()),
					env.ASSETS.fetch(
						new Request('https://assets/bg-template-token.webp'),
					).then((r) => r.arrayBuffer()),
					env.ASSETS.fetch(
						new Request('https://assets/bg-template-address.webp'),
					).then((r) => r.arrayBuffer()),
					env.ASSETS.fetch(
						new Request('https://assets/bg-template-contract.webp'),
					).then((r) => r.arrayBuffer()),
					env.ASSETS.fetch(
						new Request('https://assets/tempo-receipt.webp'),
					).then((r) => r.arrayBuffer()),
					env.ASSETS.fetch(new Request('https://assets/null.webp')).then((r) =>
						r.arrayBuffer(),
					),
				])
			imageCache = {
				bgTx,
				bgToken,
				bgAddress,
				bgContract,
				receiptLogo,
				nullIcon,
			}
			imagesInFlight = null
			return imageCache
		})()
	}
	return imagesInFlight
}

async function fetchTokenIcon(address: string): Promise<string | null> {
	try {
		const res = await fetch(
			`${TOKENLIST_ICON_URL}/${TESTNET_CHAIN_ID}/${address}`,
			{ cf: { cacheTtl: 3600 } },
		)
		if (!res.ok) return null
		const contentType = res.headers.get('content-type') || 'image/svg+xml'
		return toBase64DataUrl(await res.arrayBuffer(), contentType)
	} catch {
		return null
	}
}

// ============ Factory & Middleware ============

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

// ============ App ============

const app = factory.createApp()

app.onError((err, context) => {
	if (err instanceof HTTPException) {
		return err.getResponse()
	}
	console.error('Unexpected error:', err)
	return context.text('Internal Server Error', 500)
})

app.get('/favicon.ico', (context) =>
	context.redirect('https://docs.tempo.xyz/icon-light.png'),
)

app.get('/health', (context) => context.text('OK'))

// Apply rate limiting to OG image routes
app.use('/tx/*', rateLimiter)
app.use('/token/*', rateLimiter)
app.use('/address/*', rateLimiter)

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
app.get('/tx/:hash', async (context) => {
	const hash = context.req.param('hash')
	if (!isTxHash(hash)) {
		throw new HTTPException(400, { message: 'Invalid transaction hash' })
	}

	const url = new URL(context.req.url)
	const useCache = shouldCache(url.hostname)
	const cache = (caches as unknown as { default: Cache }).default
	const cacheKey = new Request(url.toString())

	if (useCache) {
		const cached = await cache.match(cacheKey)
		if (cached) return cached
	}

	const txParams = parseTxOgParams(hash, url.searchParams)
	const receiptData: ReceiptData = {
		hash: txParams.hash,
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

	const response = new Response(imageResponse.body, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': useCache
				? `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`
				: 'no-store',
		},
	})

	if (useCache) {
		context.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
	}
	return response
})

/**
 * Token/Asset OG Image
 */
app.get('/token/:address', async (context) => {
	const address = context.req.param('address')
	if (!Address.validate(address)) {
		throw new HTTPException(400, { message: 'Invalid token address' })
	}

	const url = new URL(context.req.url)
	const useCache = shouldCache(url.hostname)
	const cache = (caches as unknown as { default: Cache }).default
	const cacheKey = new Request(url.toString())

	if (useCache) {
		const cached = await cache.match(cacheKey)
		if (cached) return cached
	}

	const tokenParams = parseTokenOgParams(address, url.searchParams)
	const tokenData: TokenData = { ...tokenParams }

	const [fonts, images, tokenIcon] = await Promise.all([
		loadFonts(),
		loadImages(context.env),
		fetchTokenIcon(address),
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

	const response = new Response(imageResponse.body, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': useCache
				? `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`
				: 'no-store',
		},
	})

	if (useCache) {
		context.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
	}
	return response
})

/**
 * Address/Account OG Image
 */
app.get('/address/:address', async (context) => {
	const address = context.req.param('address')
	if (!Address.validate(address)) {
		throw new HTTPException(400, { message: 'Invalid address' })
	}

	const url = new URL(context.req.url)
	const useCache = shouldCache(url.hostname)
	const cache = (caches as unknown as { default: Cache }).default
	const cacheKey = new Request(url.toString())

	if (useCache) {
		const cached = await cache.match(cacheKey)
		if (cached) return cached
	}

	const addrParams = parseAddressOgParams(address, url.searchParams)
	const addressData: AddressData = {
		address: addrParams.address,
		holdings: addrParams.holdings,
		txCount: addrParams.txCount,
		lastActive: addrParams.lastActive,
		created: addrParams.created,
		feeToken: addrParams.feeToken,
		tokensHeld: addrParams.tokens,
		isContract: addrParams.isContract,
		methods: addrParams.methods,
	}

	const [fonts, images] = await Promise.all([
		loadFonts(),
		loadImages(context.env),
	])

	const bgImage = addressData.isContract ? images.bgContract : images.bgAddress

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

	const response = new Response(imageResponse.body, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': useCache
				? `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`
				: 'no-store',
		},
	})

	if (useCache) {
		context.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
	}
	return response
})

export default app
