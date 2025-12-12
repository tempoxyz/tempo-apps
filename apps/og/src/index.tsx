import puppeteer from '@cloudflare/puppeteer'
import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { Hono } from 'hono'

const FONT_MONO_URL =
	'https://unpkg.com/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2'
const FONT_INTER_URL =
	'https://unpkg.com/@fontsource/inter/files/inter-latin-500-normal.woff2'
const FONT_INTER_BOLD_URL =
	'https://unpkg.com/@fontsource/inter/files/inter-latin-700-normal.woff2'

const LOCAL_SCREENSHOT_SERVER = 'http://localhost:3001'
const devicePixelRatio = 1.0

// Cache TTL: 1 hour for OG images
const CACHE_TTL = 3600

// Global font cache (stays warm across requests in the same isolate)
let fontCache: {
	mono: ArrayBuffer | null
	inter: ArrayBuffer | null
	interBold: ArrayBuffer | null
} = { mono: null, inter: null, interBold: null }

// Global image cache
let imageCache: {
	bg: ArrayBuffer | null
	logo: ArrayBuffer | null
} = { bg: null, logo: null }

const app = new Hono<{ Bindings: Cloudflare.Env }>()

// Favicon redirect
app.get('/favicon.ico', () =>
	Response.redirect('https://docs.tempo.xyz/icon-light.png'),
)

// Health check
app.get('/health', () => new Response('OK'))

// Transaction OG image - screenshots the receipt from explorer
app.get('/tx/:hash', async (c) => {
	const hash = c.req.param('hash')

	// Validate hash format
	if (!hash || !hash.startsWith('0x') || hash.length !== 66) {
		return new Response('Invalid transaction hash', { status: 400 })
	}

	const url = new URL(c.req.url)
	const baseUrl = `${url.protocol}//${url.host}`
	const cacheKey = new Request(url.toString(), c.req.raw)

	// 1. CHECK CACHE FIRST - fastest path
	const cache = caches.default
	const cachedResponse = await cache.match(cacheKey)
	if (cachedResponse) {
		console.log('Cache HIT for', hash)
		return cachedResponse
	}
	console.log('Cache MISS for', hash)

	const isLocalDev =
		baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')
	const explorerUrl = c.env.EXPLORER_URL || 'https://explorer.tempo.xyz'

	try {
		// 2. PARALLEL FETCH: fonts, images, AND screenshot all at once
		const [fonts, images, receiptScreenshot] = await Promise.all([
			// Fonts (use cache if available)
			loadFonts(),
			// Images (use cache if available)
			loadImages(c),
			// Screenshot with timeout
			takeScreenshotWithTimeout(c, hash, explorerUrl, isLocalDev, 8000),
		])

		// 3. Generate the OG image
		const response = new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				{/* Background image */}
				<img
					src={images.bg}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>

				{/* Receipt - absolute positioned, extends to bottom */}
				<div
					tw="absolute flex"
					style={{
						left: '32px',
						top: '16px',
						bottom: '0',
					}}
				>
					{receiptScreenshot ? (
						<img
							src={receiptScreenshot}
							alt="Transaction receipt"
							tw="rounded-t-2xl shadow-2xl"
							style={{
								width: '580px',
								boxShadow: '0 8px 60px rgba(0,0,0,0.15)',
							}}
						/>
					) : (
						<div
							tw="flex flex-col bg-white rounded-t-2xl shadow-2xl items-center justify-center text-gray-400"
							style={{
								width: '580px',
								height: '620px',
								boxShadow: '0 8px 60px rgba(0,0,0,0.15)',
							}}
						>
							<span tw="text-lg">Receipt Preview</span>
							<span tw="text-sm mt-2">
								Transaction: {hash.slice(0, 10)}...{hash.slice(-6)}
							</span>
						</div>
					)}
				</div>

				{/* Right side branding */}
				<div
					tw="absolute flex flex-col gap-4"
					style={{
						right: '40px',
						top: '120px',
						left: '660px',
					}}
				>
					{/* Tempo lockup logo */}
					<img src={images.logo} alt="Tempo" tw="mb-2" width={120} height={28} />

					{/* CTA text */}
					<div
						tw="flex flex-col text-[36px] text-gray-600 leading-tight"
						style={{
							fontFamily: 'Inter',
							letterSpacing: '-0.02em',
						}}
					>
						<span>View more about this</span>
						<span>transaction using</span>
						<div tw="flex items-center gap-3">
							<span>the explorer</span>
							<span tw="text-black text-[42px]">→</span>
						</div>
					</div>
				</div>
			</div>,
			{
				width: 1200 * devicePixelRatio,
				height: 630 * devicePixelRatio,
				format: 'webp',
				module,
				fonts: [
					{ weight: 400, name: 'GeistMono', data: fonts.mono, style: 'normal' },
					{ weight: 500, name: 'Inter', data: fonts.inter, style: 'normal' },
					{
						weight: 700,
						name: 'Inter',
						data: fonts.interBold,
						style: 'normal',
					},
				],
			},
		)

		// 4. Clone response for caching (can only read body once)
		const responseToCache = new Response(response.body, {
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
				'CDN-Cache-Control': `max-age=${CACHE_TTL}`,
			},
		})

		// 5. Store in cache (don't await - fire and forget)
		c.executionCtx.waitUntil(cache.put(cacheKey, responseToCache.clone()))

		return responseToCache
	} catch (error) {
		console.error('Error generating OG image:', error)
		return new Response(
			`Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ status: 500 },
		)
	}
})

// Helper: Load fonts with in-memory caching
async function loadFonts() {
	if (!fontCache.mono || !fontCache.inter || !fontCache.interBold) {
		const [mono, inter, interBold] = await Promise.all([
			fetch(FONT_MONO_URL).then((r) => r.arrayBuffer()),
			fetch(FONT_INTER_URL).then((r) => r.arrayBuffer()),
			fetch(FONT_INTER_BOLD_URL).then((r) => r.arrayBuffer()),
		])
		fontCache = { mono, inter, interBold }
	}
	return fontCache as { mono: ArrayBuffer; inter: ArrayBuffer; interBold: ArrayBuffer }
}

// Helper: Load images with in-memory caching
async function loadImages(c: { env: Cloudflare.Env }) {
	if (!imageCache.bg || !imageCache.logo) {
		const [bgRes, logoRes] = await Promise.all([
			c.env.ASSETS.fetch(new Request('https://assets/bg-template.png')),
			c.env.ASSETS.fetch(new Request('https://assets/tempo-lockup.png')),
		])
		imageCache = {
			bg: await bgRes.arrayBuffer(),
			logo: await logoRes.arrayBuffer(),
		}
	}
	return {
		bg: `data:image/png;base64,${Buffer.from(imageCache.bg).toString('base64')}`,
		logo: `data:image/png;base64,${Buffer.from(imageCache.logo).toString('base64')}`,
	}
}

// Helper: Take screenshot with timeout
async function takeScreenshotWithTimeout(
	c: { env: Cloudflare.Env },
	hash: string,
	explorerUrl: string,
	isLocalDev: boolean,
	timeoutMs: number,
): Promise<string | null> {
	const timeoutPromise = new Promise<null>((resolve) =>
		setTimeout(() => resolve(null), timeoutMs),
	)

	const screenshotPromise = (async (): Promise<string | null> => {
		if (isLocalDev) {
			try {
				const res = await fetch(`${LOCAL_SCREENSHOT_SERVER}/screenshot/${hash}`)
				if (res.ok) {
					const data = await res.arrayBuffer()
					return `data:image/png;base64,${Buffer.from(data).toString('base64')}`
				}
			} catch (e) {
				console.error('Local screenshot failed:', e)
			}
			return null
		}

		if (!c.env.BROWSER) return null

		let browser
		try {
			browser = await puppeteer.launch(c.env.BROWSER)
			const page = await browser.newPage()

			await page.setViewport({
				width: 500,
				height: 900,
				deviceScaleFactor: 2,
			})

			const receiptUrl = `${explorerUrl}/receipt/${hash}`
			await page.goto(receiptUrl, { waitUntil: 'networkidle0', timeout: 6000 })

			// Try data-receipt first, then fall back to w-[360px] class selector
			await page
				.waitForSelector('[data-receipt], .w-\\[360px\\]', { timeout: 3000 })
				.catch(() => {})

			let receiptElement = await page.$('[data-receipt]')
			if (!receiptElement) {
				receiptElement = await page.$('.w-\\[360px\\]')
			}

			const screenshotBuffer = receiptElement
				? await receiptElement.screenshot({ type: 'png' })
				: await page.screenshot({
						type: 'png',
						clip: { x: 0, y: 80, width: 420, height: 600 },
					})

			return `data:image/png;base64,${Buffer.from(screenshotBuffer).toString('base64')}`
		} catch (e) {
			console.error('Browser screenshot failed:', e)
			return null
		} finally {
			if (browser) await browser.close()
		}
	})()

	return Promise.race([screenshotPromise, timeoutPromise])
}

// Legacy default route
app.get('/', async (c) => {
	const { searchParams } = new URL(c.req.url)

	const title = searchParams.get('title')
	const theme = searchParams.get('theme')
	const description = searchParams.get('description')

	if (!title || !description || !theme) {
		return new Response('Bad Request', { status: 400 })
	}

	const fonts = await loadFonts()

	return new ImageResponse(
		<div
			tw={`size-full min-w-full flex flex-col items-center justify-center ${theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'}`}
		>
			<img
				alt="tempo"
				tw="w-92"
				src="https://raw.githubusercontent.com/tempoxyz/.github/refs/heads/main/assets/combomark-dark.svg"
			/>
			<h1 tw="text-9xl font-bold">{title}</h1>
			<p tw="text-2xl">{description}</p>
		</div>,
		{
			width: 1200 * devicePixelRatio,
			height: 630 * devicePixelRatio,
			format: 'webp',
			module,
			fonts: [{ weight: 400, name: 'Inter', data: fonts.mono, style: 'normal' }],
		},
	)
})

export default app
