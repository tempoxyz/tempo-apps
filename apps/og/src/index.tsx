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

	try {
		let receiptScreenshot: string | null = null
		const isLocalDev =
			baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')

		// Get explorer URL from env or use default
		const explorerUrl = c.env.EXPLORER_URL || 'https://explorer.tempo.xyz'

		if (isLocalDev) {
			// Local dev: Use local screenshot server
			try {
				console.log('Using local screenshot server...')
				const screenshotResponse = await fetch(
					`${LOCAL_SCREENSHOT_SERVER}/screenshot/${hash}`,
				)
				if (screenshotResponse.ok) {
					const screenshotData = await screenshotResponse.arrayBuffer()
					receiptScreenshot = `data:image/png;base64,${Buffer.from(screenshotData).toString('base64')}`
					console.log('Local screenshot successful')
				}
			} catch (error) {
				console.error('Local screenshot failed:', error)
			}
		} else if (c.env.BROWSER) {
			// Production: Use Cloudflare's browser binding
			try {
				const browser = await puppeteer.launch(c.env.BROWSER)
				const page = await browser.newPage()

				await page.setViewport({
					width: 500,
					height: 900,
					deviceScaleFactor: 2,
				})

				const receiptUrl = `${explorerUrl}/receipt/${hash}`
				await page.goto(receiptUrl, { waitUntil: 'networkidle0' })

				// Try data-receipt first, then fall back to w-[360px] class selector
				const receiptSelector = '[data-receipt], .w-\\[360px\\]'
				await page
					.waitForSelector(receiptSelector, { timeout: 10000 })
					.catch(() => {})

				// Try to find the receipt element
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

				await browser.close()
				receiptScreenshot = `data:image/png;base64,${Buffer.from(screenshotBuffer).toString('base64')}`
			} catch (browserError) {
				console.error('Browser screenshot failed:', browserError)
			}
		}

		// Fetch fonts
		const [fontMonoData, fontInterData, fontInterBoldData] = await Promise.all([
			fetch(FONT_MONO_URL).then((res) => res.arrayBuffer()),
			fetch(FONT_INTER_URL).then((res) => res.arrayBuffer()),
			fetch(FONT_INTER_BOLD_URL).then((res) => res.arrayBuffer()),
		])

		// Fetch images using ASSETS binding (avoids self-fetch issues)
		const bgImageResponse = await c.env.ASSETS.fetch(
			new Request('https://assets/bg-template.png'),
		)
		const tempoLockupResponse = await c.env.ASSETS.fetch(
			new Request('https://assets/tempo-lockup.png'),
		)

		const bgImageData = await bgImageResponse.arrayBuffer()
		const tempoLockupData = await tempoLockupResponse.arrayBuffer()

		// Convert to base64 data URLs
		const bgImageBase64 = `data:image/png;base64,${Buffer.from(bgImageData).toString('base64')}`
		const tempoLockupBase64 = `data:image/png;base64,${Buffer.from(tempoLockupData).toString('base64')}`

		return new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				{/* Background image */}
				<img
					src={bgImageBase64}
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
					<img src={tempoLockupBase64} alt="Tempo" tw="mb-2" width={120} height={28} />

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
					{
						weight: 400,
						name: 'GeistMono',
						data: fontMonoData,
						style: 'normal',
					},
					{
						weight: 500,
						name: 'Inter',
						data: fontInterData,
						style: 'normal',
					},
					{
						weight: 700,
						name: 'Inter',
						data: fontInterBoldData,
						style: 'normal',
					},
				],
			},
		)
	} catch (error) {
		console.error('Error generating OG image:', error)
		return new Response(
			`Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ status: 500 },
		)
	}
})

// Legacy default route
app.get('/', async (c) => {
	const { searchParams } = new URL(c.req.url)

	const title = searchParams.get('title')
	const theme = searchParams.get('theme')
	const description = searchParams.get('description')

	if (!title || !description || !theme) {
		return new Response('Bad Request', { status: 400 })
	}

	const fontData = await fetch(FONT_MONO_URL).then((res) => res.arrayBuffer())

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
			fonts: [
				{
					weight: 400,
					name: 'Inter',
					data: fontData,
					style: 'normal',
				},
			],
		},
	)
})

export default app
