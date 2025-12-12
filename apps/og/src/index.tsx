import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { Hono } from 'hono'

const FONT_MONO_URL =
	'https://unpkg.com/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2'
const FONT_INTER_URL =
	'https://unpkg.com/@fontsource/inter/files/inter-latin-500-normal.woff2'

const devicePixelRatio = 1.0

// Cache TTL: 1 hour for OG images
const CACHE_TTL = 3600

// Global caches
let fontCache: { mono: ArrayBuffer | null; inter: ArrayBuffer | null } = {
	mono: null,
	inter: null,
}
let imageCache: {
	bg: ArrayBuffer | null
	logo: ArrayBuffer | null
	receiptLogo: ArrayBuffer | null
} = {
	bg: null,
	logo: null,
	receiptLogo: null,
}

const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.get('/favicon.ico', () =>
	Response.redirect('https://docs.tempo.xyz/icon-light.png'),
)

app.get('/health', () => new Response('OK'))

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
 * - e1, e2, e3, e4: Event strings in format "Action|Details|Amount|Message"
 *   Examples:
 *   - "Send|aUSD to|-$1.54|Thanks for the coffee."
 *   - "Swap|10 pathUSD for 10 AlphaUSD|$10|"
 *   - "Approve|for 0x1234...5678|$10|"
 *
 * Example URL:
 * /tx/0x123...?block=12331&sender=0x8f5a...3bc3&date=11/24/2025&time=11:04:01 GMT+0&fee=-$0.013&feeToken=aUSD&feePayer=0x8f5a...3bc3&total=-$1.55&e1=Send|aUSD to|-$1.54|Thanks for the coffee.
 */
app.get('/tx/:hash', async (c) => {
	const hash = c.req.param('hash')

	if (!hash || !hash.startsWith('0x') || hash.length !== 66) {
		return new Response('Invalid transaction hash', { status: 400 })
	}

	const url = new URL(c.req.url)
	const params = url.searchParams
	const cacheKey = new Request(url.toString(), c.req.raw)

	// Check cache first
	const cache = (caches as unknown as { default: Cache }).default
	const cachedResponse = await cache.match(cacheKey)
	if (cachedResponse) {
		return cachedResponse
	}

	try {
		// Parse URL parameters
		const receiptData: ReceiptData = {
			hash,
			blockNumber: params.get('block') || '—',
			sender: params.get('sender') || '—',
			date: params.get('date') || '—',
			time: params.get('time') || '—',
			fee: params.get('fee') || undefined,
			feeToken: params.get('feeToken') || undefined,
			feePayer: params.get('feePayer') || undefined,
			total: params.get('total') || undefined,
			events: [],
		}

		// Parse events (e1, e2, e3, e4) - format: "Action|Details|Amount|Message"
		for (let i = 1; i <= 6; i++) {
			const eventParam = params.get(`e${i}`)
			if (eventParam) {
				const [action, details, amount, message] = eventParam.split('|')
				if (action) {
					receiptData.events.push({
						action: action || '',
						details: details || '',
						amount: amount || undefined,
						message: message || undefined,
					})
				}
			}
		}

		// Fetch assets
		const [fonts, images] = await Promise.all([loadFonts(), loadImages(c)])

		const response = new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				{/* Background image */}
				<img
					src={images.bg}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>

				{/* Receipt */}
				<div
					tw="absolute flex"
					style={{ left: '56px', top: '40px', bottom: '0' }}
				>
					<ReceiptCard data={receiptData} receiptLogo={images.receiptLogo} />
				</div>

				{/* Right side branding */}
				<div
					tw="absolute flex flex-col"
					style={{ right: '48px', top: '100px', left: '700px', gap: '20px' }}
				>
					<img
						src={images.logo}
						alt="Tempo"
						style={{ width: '260px', height: '61px' }}
					/>
					<div
						tw="flex flex-col text-[36px] text-gray-500"
						style={{
							fontFamily: 'Inter',
							letterSpacing: '-0.02em',
							lineHeight: '1.35',
						}}
					>
						<span>View more about this</span>
						<span>transaction using</span>
						<div tw="flex items-center" style={{ gap: '8px' }}>
							<span>the explorer</span>
							<span tw="text-gray-500 text-[36px]">→</span>
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
				],
			},
		)

		const responseToCache = new Response(response.body, {
			headers: {
				'Content-Type': 'image/webp',
				'Cache-Control': `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
			},
		})

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

// ============ Types ============

interface ReceiptData {
	hash: string
	blockNumber: string
	sender: string
	date: string
	time: string
	fee?: string
	feeToken?: string
	feePayer?: string
	total?: string
	events: ReceiptEvent[]
}

interface ReceiptEvent {
	action: string
	details: string
	amount?: string
	message?: string
}

// ============ Receipt Component ============

function ReceiptCard({
	data,
	receiptLogo,
}: {
	data: ReceiptData
	receiptLogo: string
}) {
	return (
		<div
			tw="flex flex-col bg-white rounded-t-3xl shadow-2xl"
			style={{
				width: '640px',
				boxShadow: '0 8px 60px rgba(0,0,0,0.12)',
			}}
		>
			{/* Header */}
			<div tw="flex w-full px-8 pt-8 pb-6" style={{ gap: '24px' }}>
				{/* Tempo Receipt logo - natural aspect ratio */}
				<div tw="flex shrink-0 items-start">
					<img
						src={receiptLogo}
						alt="Tempo Receipt"
						style={{ width: '140px', height: 'auto' }}
					/>
				</div>

				{/* Details - right aligned values */}
				<div
					tw="flex flex-col flex-1 text-[22px]"
					style={{ fontFamily: 'GeistMono', gap: '12px', marginLeft: '12px' }}
				>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-400">Block</span>
						<span tw="text-emerald-600">#{data.blockNumber}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-400">Sender</span>
						<span tw="text-emerald-600">{truncateHash(data.sender, 6)}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-400">Hash</span>
						<span>{truncateHash(data.hash, 6)}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-400">Date</span>
						<span>{data.date}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-400">Time</span>
						<span>{data.time}</span>
					</div>
				</div>
			</div>

			{/* Events */}
			{data.events.length > 0 && (
				<>
					<div
						tw="flex"
						style={{
							height: '1px',
							backgroundColor: '#d1d5db',
							marginLeft: 28,
							marginRight: 28,
						}}
					/>
					<div
						tw="flex flex-col py-5 text-[22px]"
						style={{
							fontFamily: 'GeistMono',
							gap: '12px',
							paddingLeft: 28,
							paddingRight: 28,
						}}
					>
						{data.events.slice(0, 4).map((event, index) => (
							<div
								key={`${event.action}-${index}`}
								tw="flex justify-between items-center"
								style={{ width: '100%' }}
							>
								<div tw="flex items-center" style={{ gap: '6px' }}>
									<span tw="text-gray-400">{index + 1}.</span>
									<span tw="flex bg-gray-100 px-2 py-1 rounded">
										{event.action}
									</span>
									{event.details && <EventDetails details={event.details} />}
								</div>
								{event.amount && <span tw="shrink-0">{event.amount}</span>}
							</div>
						))}
					</div>
				</>
			)}

			{/* Fee and Total rows */}
			{(data.fee || data.total) && (
				<>
					<div
						tw="flex"
						style={{
							height: '1px',
							backgroundColor: '#d1d5db',
							marginLeft: 28,
							marginRight: 28,
						}}
					/>
					<div
						tw="flex flex-col py-5 text-[22px]"
						style={{
							fontFamily: 'GeistMono',
							gap: '12px',
							paddingLeft: 28,
							paddingRight: 28,
						}}
					>
						{data.fee && (
							<div tw="flex" style={{ width: '100%' }}>
								<span tw="text-gray-400" style={{ flex: 1 }}>
									Fee{data.feeToken ? ` (${data.feeToken})` : ''}
								</span>
								<span>{data.fee}</span>
							</div>
						)}
						{data.total && (
							<div tw="flex" style={{ width: '100%' }}>
								<span tw="text-gray-400" style={{ flex: 1 }}>
									Total
								</span>
								<span>{data.total}</span>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}

// ============ Helpers ============

function truncateHash(hash: string, chars = 4): string {
	if (!hash || hash === '—') return hash
	if (hash.length <= chars * 2 + 2) return hash
	return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`
}

// Parse event details and highlight assets (green) and addresses (blue)
function EventDetails({ details }: { details: string }) {
	const parts: { text: string; type: 'normal' | 'asset' | 'address' }[] = []

	const words = details.split(' ')
	let i = 0
	while (i < words.length) {
		const word = words[i]

		// Check if this is an address (starts with 0x or contains ...)
		if (
			word?.startsWith('0x') ||
			(word?.includes('...') && word?.match(/[0-9a-fA-F]/))
		) {
			parts.push({ text: word, type: 'address' })
			i++
		}
		// Check if this is a number followed by a token name
		else if (
			word?.match(/^[\d.]+$/) &&
			words[i + 1] &&
			!['for', 'to', 'from'].includes(words[i + 1])
		) {
			parts.push({ text: `${word} ${words[i + 1]}`, type: 'asset' })
			i += 2
		}
		// Regular word
		else {
			parts.push({ text: word || '', type: 'normal' })
			i++
		}
	}

	return (
		<span tw="flex">
			{parts.map((part, idx) => (
				<span
					key={`${part.text}-${idx}`}
					tw={
						part.type === 'asset'
							? 'text-emerald-600'
							: part.type === 'address'
								? 'text-blue-600'
								: 'text-gray-500'
					}
				>
					{part.text}
					{idx < parts.length - 1 ? ' ' : ''}
				</span>
			))}
		</span>
	)
}

// ============ Asset Loading ============

async function loadFonts() {
	if (!fontCache.mono || !fontCache.inter) {
		const [mono, inter] = await Promise.all([
			fetch(FONT_MONO_URL).then((r) => r.arrayBuffer()),
			fetch(FONT_INTER_URL).then((r) => r.arrayBuffer()),
		])
		fontCache = { mono, inter }
	}
	return fontCache as { mono: ArrayBuffer; inter: ArrayBuffer }
}

async function loadImages(c: { env: Cloudflare.Env }) {
	if (!imageCache.bg || !imageCache.logo || !imageCache.receiptLogo) {
		const [bgRes, logoRes, receiptLogoRes] = await Promise.all([
			c.env.ASSETS.fetch(new Request('https://assets/bg-template.png')),
			c.env.ASSETS.fetch(new Request('https://assets/tempo-lockup.png')),
			c.env.ASSETS.fetch(new Request('https://assets/tempo-receipt.png')),
		])
		imageCache = {
			bg: await bgRes.arrayBuffer(),
			logo: await logoRes.arrayBuffer(),
			receiptLogo: await receiptLogoRes.arrayBuffer(),
		}
	}
	const { bg, logo, receiptLogo } = imageCache as {
		bg: ArrayBuffer
		logo: ArrayBuffer
		receiptLogo: ArrayBuffer
	}
	return {
		bg: `data:image/png;base64,${Buffer.from(bg).toString('base64')}`,
		logo: `data:image/png;base64,${Buffer.from(logo).toString('base64')}`,
		receiptLogo: `data:image/png;base64,${Buffer.from(receiptLogo).toString('base64')}`,
	}
}

// ============ Legacy Route ============

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
			fonts: [
				{ weight: 400, name: 'Inter', data: fonts.mono, style: 'normal' },
			],
		},
	)
})

export default app
