import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { Hono } from 'hono'

const FONT_MONO_URL =
	'https://unpkg.com/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2'
const FONT_INTER_URL =
	'https://unpkg.com/@fontsource/inter/files/inter-latin-500-normal.woff2'

// Token icon service - {chainId}/{tokenAddress}
const TOKENLIST_ICON_URL = 'https://tokenlist.tempo.xyz/icon'
const TESTNET_CHAIN_ID = 42429

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
	nullIcon: ArrayBuffer | null
} = {
	bg: null,
	logo: null,
	receiptLogo: null,
	nullIcon: null,
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
					style={{ left: '40px', top: '24px', bottom: '0' }}
				>
					<ReceiptCard data={receiptData} receiptLogo={images.receiptLogo} />
				</div>

				{/* Right side branding */}
				<div
					tw="absolute flex flex-col"
					style={{ right: '40px', top: '80px', left: '780px', gap: '16px' }}
				>
					<img
						src={images.logo}
						alt="Tempo"
						style={{ width: '220px', height: '52px' }}
					/>
					<div
						tw="flex flex-col text-[28px] text-gray-500"
						style={{
							fontFamily: 'Inter',
							letterSpacing: '-0.02em',
							lineHeight: '1.4',
						}}
					>
						<span>View more about</span>
						<span>this transaction</span>
						<span>using the explorer →</span>
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

/**
 * Token/Asset OG Image
 *
 * URL Parameters:
 * - address: Token address (0x...)
 * - name: Token name (e.g., "alphaUSD")
 * - symbol: Token symbol (e.g., "AUSD")
 * - currency: Currency (e.g., "USD")
 * - holders: Number of holders
 * - supply: Total supply formatted
 * - created: Creation date
 * - quoteToken: Quote token symbol (e.g., "pathUSD")
 */
app.get('/token/:address', async (c) => {
	const address = c.req.param('address')

	if (!address || !address.startsWith('0x')) {
		return new Response('Invalid token address', { status: 400 })
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
		const tokenData: TokenData = {
			address,
			name: params.get('name') || '—',
			symbol: params.get('symbol') || '—',
			currency: params.get('currency') || '—',
			holders: params.get('holders') || '—',
			supply: params.get('supply') || '—',
			created: params.get('created') || '—',
			quoteToken: params.get('quoteToken') || undefined,
		}

		// Fetch assets and token icon in parallel
		const [fonts, images, tokenIcon] = await Promise.all([
			loadFonts(),
			loadImages(c),
			fetchTokenIcon(address),
		])

		const response = new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				{/* Background image */}
				<img
					src={images.bg}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>

				{/* Token Card */}
				<div tw="absolute flex" style={{ left: '56px', top: '40px' }}>
					<TokenCard data={tokenData} icon={tokenIcon || images.nullIcon} />
				</div>

				{/* Right side branding - same as tx version */}
				<div
					tw="absolute flex flex-col ml-16"
					style={{ right: '48px', top: '100px', left: '700px', gap: '20px' }}
				>
					<img
						src={images.logo}
						alt="Tempo"
						style={{ width: '260px', height: '61px' }}
					/>
					<div
						tw="flex flex-col text-[34px] text-gray-500"
						style={{
							fontFamily: 'Inter',
							letterSpacing: '-0.02em',
							lineHeight: '1.35',
						}}
					>
						<span>View more about this</span>
						<span>asset using the</span>
						<div tw="flex items-center" style={{ gap: '8px' }}>
							<span>explorer</span>
							<span tw="text-gray-500 text-[34px]">→</span>
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
		console.error('Error generating token OG image:', error)
		return new Response(
			`Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ status: 500 },
		)
	}
})

/**
 * Address/Account OG Image
 *
 * URL Parameters:
 * - address: Account address (0x...)
 * - holdings: Total holdings value (e.g., "$32,325.41")
 * - txCount: Number of transactions
 * - lastActive: Last activity datetime (e.g., "11/19/2025 11:35")
 * - created: Account creation datetime (e.g., "11/1/2025 16:43")
 * - feeToken: Fee token symbol (e.g., "pathUSD")
 * - tokens: Comma-separated list of token symbols held (e.g., "AUSD,BUSD,CUSD")
 */
app.get('/address/:address', async (c) => {
	const address = c.req.param('address')

	if (!address || !address.startsWith('0x')) {
		return new Response('Invalid address', { status: 400 })
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
		const tokensParam = params.get('tokens') || ''
		const addressData: AddressData = {
			address,
			holdings: params.get('holdings') || '—',
			txCount: params.get('txCount') || '—',
			lastActive: params.get('lastActive') || '—',
			created: params.get('created') || '—',
			feeToken: params.get('feeToken') || '—',
			tokensHeld: tokensParam ? tokensParam.split(',').filter(Boolean) : [],
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

				{/* Address Card */}
				<div tw="absolute flex" style={{ left: '56px', top: '40px' }}>
					<AddressCard data={addressData} />
				</div>

				{/* Right side branding - same as tx version */}
				<div
					tw="absolute flex flex-col ml-16"
					style={{ right: '48px', top: '100px', left: '700px', gap: '20px' }}
				>
					<img
						src={images.logo}
						alt="Tempo"
						style={{ width: '260px', height: '61px' }}
					/>
					<div
						tw="flex flex-col text-[34px] text-gray-500"
						style={{
							fontFamily: 'Inter',
							letterSpacing: '-0.02em',
							lineHeight: '1.35',
						}}
					>
						<span>View more about this</span>
						<span>address using the</span>
						<div tw="flex items-center" style={{ gap: '8px' }}>
							<span>explorer</span>
							<span tw="text-gray-500 text-[34px]">→</span>
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
		console.error('Error generating address OG image:', error)
		return new Response(
			`Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ status: 500 },
		)
	}
})

// ============ Types ============

interface TokenData {
	address: string
	name: string
	symbol: string
	currency: string
	holders: string
	supply: string
	created: string
	quoteToken?: string
}

interface AddressData {
	address: string
	holdings: string
	txCount: string
	lastActive: string
	created: string
	feeToken: string
	tokensHeld: string[] // Array of token symbols
}

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
	// Combine date and time
	const when = data.date !== '—' ? `${data.date} ${data.time}` : '—'

	return (
		<div
			tw="flex flex-col bg-white rounded-t-3xl shadow-2xl"
			style={{
				width: '720px',
				boxShadow: '0 8px 60px rgba(0,0,0,0.12)',
			}}
		>
			{/* Header */}
			<div tw="flex w-full px-8 pt-8 pb-6" style={{ gap: '24px' }}>
				{/* Tempo Receipt logo */}
				<div tw="flex shrink-0 items-start">
					<img
						src={receiptLogo}
						alt="Tempo Receipt"
						style={{ width: '170px', height: 'auto' }}
					/>
				</div>

				{/* Details - condensed */}
				<div
					tw="flex flex-col flex-1 text-[24px]"
					style={{
						fontFamily: 'GeistMono',
						gap: '16px',
						marginLeft: '12px',
						letterSpacing: '-0.02em',
					}}
				>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-400">Sender</span>
						<span tw="text-emerald-600">{truncateHash(data.sender, 6)}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-400">When</span>
						<span>{when}</span>
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
						}}
					/>
					<div
						tw="flex flex-col py-5 px-8 text-[24px]"
						style={{
							fontFamily: 'GeistMono',
							gap: '14px',
							width: '100%',
							letterSpacing: '-0.02em',
						}}
					>
						{data.events.slice(0, 5).map((event, index) => (
							<div
								key={`${event.action}-${index}`}
								tw="flex"
								style={{
									width: '100%',
									justifyContent: 'space-between',
									alignItems: 'flex-start',
								}}
							>
								{/* Left: number + action + details */}
								<div
									tw="flex"
									style={{
										flex: 1,
										alignItems: 'flex-start',
										gap: '8px',
										flexWrap: 'wrap',
									}}
								>
									{/* Number */}
									<span
										tw="text-gray-400 shrink-0"
										style={{ lineHeight: '30px' }}
									>
										{index + 1}.
									</span>
									{/* Action badge */}
									<span
										tw="flex bg-gray-100 px-2 py-1 rounded shrink-0"
										style={{ lineHeight: '22px' }}
									>
										{event.action}
									</span>
									{/* Details */}
									{event.details && <EventDetails details={event.details} />}
								</div>
								{/* Amount on right */}
								{event.amount && (
									<span tw="shrink-0" style={{ lineHeight: '30px' }}>
										{event.amount}
									</span>
								)}
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
						}}
					/>
					<div
						tw="flex flex-col py-5 px-8 text-[24px]"
						style={{
							fontFamily: 'GeistMono',
							gap: '14px',
							width: '100%',
							letterSpacing: '-0.02em',
						}}
					>
						{data.fee && (
							<div
								tw="flex items-center"
								style={{ width: '100%', justifyContent: 'space-between' }}
							>
								<span tw="text-gray-400">
									Fee{data.feeToken ? ` (${data.feeToken})` : ''}
								</span>
								<span>{data.fee}</span>
							</div>
						)}
						{data.total && (
							<div
								tw="flex items-center"
								style={{ width: '100%', justifyContent: 'space-between' }}
							>
								<span tw="text-gray-400">Total</span>
								<span>{data.total}</span>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}

// ============ Token Card Component ============

function TokenCard({ data, icon }: { data: TokenData; icon: string }) {
	return (
		<div
			tw="flex flex-col bg-white rounded-3xl shadow-2xl"
			style={{
				width: '640px',
				boxShadow: '0 8px 60px rgba(0,0,0,0.12)',
			}}
		>
			{/* Header with icon and name */}
			<div tw="flex items-center px-8 pt-12 pb-12" style={{ gap: '16px' }}>
				{/* Token icon from tokenlist or fallback to null icon */}
				<img
					src={icon}
					alt=""
					tw="rounded-full"
					style={{ width: '64px', height: '64px' }}
				/>
				<div tw="flex flex-col flex-1">
					<span tw="text-3xl font-semibold text-gray-900">{data.name}</span>
				</div>
				{/* Symbol badge */}
				<div
					tw="flex items-center px-4 py-2 bg-gray-100 rounded-lg text-gray-600 text-xl"
					style={{ fontFamily: 'GeistMono' }}
				>
					{data.symbol}
				</div>
			</div>

			{/* Divider */}
			<div
				tw="flex mx-8"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
				}}
			/>

			{/* Details */}
			<div
				tw="flex flex-col px-8 py-6 text-[23.5px]"
				style={{
					fontFamily: 'GeistMono',
					gap: '16px',
					letterSpacing: '-0.02em',
				}}
			>
				{/* Address - truncated */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Address</span>
					<span tw="text-blue-500">{truncateHash(data.address, 8)}</span>
				</div>

				{/* Currency */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Currency</span>
					<span tw="text-gray-900">{data.currency}</span>
				</div>

				{/* Holders */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Holders</span>
					<span tw="text-gray-900">{data.holders}</span>
				</div>

				{/* Supply */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Supply</span>
					<span tw="text-gray-900">{data.supply}</span>
				</div>

				{/* Created */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Created</span>
					<span tw="text-gray-900">{data.created}</span>
				</div>

				{/* Quote Token (if available) */}
				{data.quoteToken && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-400">Quote Token</span>
						<span tw="text-gray-900">{data.quoteToken}</span>
					</div>
				)}
			</div>
		</div>
	)
}

// ============ Token Badges Helper ============

function TokenBadges({ tokens }: { tokens: string[] }) {
	// Create unique keys by counting occurrences
	const keyedTokens = tokens.map((token, i) => {
		const prevCount = tokens.slice(0, i).filter((t) => t === token).length
		return { token, key: `${token}-${prevCount}` }
	})

	return (
		<>
			{keyedTokens.map(({ token, key }) => (
				<span
					key={key}
					tw="flex px-3 py-1 bg-gray-100 rounded text-gray-700 text-[18px]"
					style={{ fontFamily: 'GeistMono' }}
				>
					{token}
				</span>
			))}
		</>
	)
}

// ============ Address Card Component ============

function AddressCard({ data }: { data: AddressData }) {
	// Split address into two lines for display
	const addrLine1 = data.address.slice(0, 22)
	const addrLine2 = data.address.slice(22)

	return (
		<div
			tw="flex flex-col bg-white rounded-3xl shadow-2xl"
			style={{
				width: '640px',
				boxShadow: '0 8px 60px rgba(0,0,0,0.12)',
			}}
		>
			{/* Address header */}
			<div tw="flex w-full px-8 pt-8 pb-6 justify-between items-start">
				<span
					tw="text-gray-400 text-[23.5px]"
					style={{ fontFamily: 'GeistMono' }}
				>
					Address
				</span>
				<div
					tw="flex flex-col items-end text-[23.5px] text-blue-500"
					style={{ fontFamily: 'GeistMono', lineHeight: '1.3' }}
				>
					<span>{addrLine1}</span>
					<span>{addrLine2}</span>
				</div>
			</div>

			{/* Divider - dashed */}
			<div
				tw="flex mx-8"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					borderStyle: 'dashed',
				}}
			/>

			{/* Details */}
			<div
				tw="flex flex-col px-8 py-6 text-[23.5px]"
				style={{
					fontFamily: 'GeistMono',
					gap: '16px',
					letterSpacing: '-0.02em',
				}}
			>
				{/* Holdings */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Holdings</span>
					<span tw="text-gray-900">{data.holdings}</span>
				</div>

				{/* Transactions */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Transactions</span>
					<span tw="text-gray-900">{data.txCount}</span>
				</div>

				{/* Last Active */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Last Active</span>
					<span tw="text-gray-900">{data.lastActive}</span>
				</div>

				{/* Created */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Created</span>
					<span tw="text-gray-900">{data.created}</span>
				</div>

				{/* Fee Token */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-400">Fee Token</span>
					<span tw="text-gray-900">{data.feeToken}</span>
				</div>
			</div>

			{/* Tokens Held section */}
			{data.tokensHeld.length > 0 && (
				<>
					{/* Divider - dashed */}
					<div
						tw="flex mx-8"
						style={{
							height: '1px',
							backgroundColor: '#d1d5db',
							borderStyle: 'dashed',
						}}
					/>

					<div tw="flex flex-col px-8 py-6" style={{ gap: '12px' }}>
						<span
							tw="text-gray-400 text-[23.5px]"
							style={{ fontFamily: 'GeistMono' }}
						>
							Tokens Held
						</span>
						<div tw="flex flex-wrap" style={{ gap: '8px' }}>
							<TokenBadges tokens={data.tokensHeld.slice(0, 12)} />
							{data.tokensHeld.length > 12 && (
								<span
									tw="flex px-3 py-1 bg-gray-100 rounded text-gray-500 text-[18px]"
									style={{ fontFamily: 'GeistMono' }}
								>
									+{data.tokensHeld.length - 12}
								</span>
							)}
						</div>
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

// Fetch token icon from tokenlist service, returns base64 data URL or null
async function fetchTokenIcon(address: string): Promise<string | null> {
	try {
		const iconUrl = `${TOKENLIST_ICON_URL}/${TESTNET_CHAIN_ID}/${address}`
		const response = await fetch(iconUrl, {
			cf: { cacheTtl: 3600 }, // Cache for 1 hour
		})

		if (!response.ok) return null

		const contentType = response.headers.get('content-type') || 'image/svg+xml'
		const data = await response.arrayBuffer()

		// Convert to base64 data URL
		return `data:${contentType};base64,${Buffer.from(data).toString('base64')}`
	} catch {
		return null
	}
}

// Parse event details and highlight assets (green) and addresses (blue)
function EventDetails({ details }: { details: string }) {
	// Parse into groups that should stay together (asset + connector like "for")
	const groups: { text: string; type: 'normal' | 'asset' | 'address' }[] = []

	const words = details.split(' ')
	let i = 0
	while (i < words.length) {
		const word = words[i]

		// Check if this is an address (starts with 0x or contains ...)
		if (
			word?.startsWith('0x') ||
			(word?.includes('...') && word?.match(/[0-9a-fA-F]/))
		) {
			groups.push({ text: word, type: 'address' })
			i++
		}
		// Check if this is a number followed by a token name (asset)
		else if (
			word?.match(/^[\d.]+$/) &&
			words[i + 1] &&
			!['for', 'to', 'from'].includes(words[i + 1] as string)
		) {
			// Asset: "10.00 pathUSD"
			groups.push({ text: `${word} ${words[i + 1]}`, type: 'asset' })
			i += 2
			// Add following connector word (for, to, from) as normal/gray
			const connector = words[i]
			if (connector && ['for', 'to', 'from'].includes(connector)) {
				groups.push({ text: connector, type: 'normal' })
				i++
			}
		}
		// Connector word at start (like "to 0x...")
		else if (['for', 'to', 'from'].includes(word || '')) {
			groups.push({ text: word || '', type: 'normal' })
			i++
		}
		// Regular word
		else {
			groups.push({ text: word || '', type: 'normal' })
			i++
		}
	}

	return (
		<span
			tw="flex"
			style={{
				flexWrap: 'wrap',
				gap: '8px',
				flex: 1,
				minWidth: 0,
				alignItems: 'flex-start',
				alignContent: 'flex-start',
				lineHeight: '30px',
			}}
		>
			{groups.map((part, idx) => (
				<span
					key={`${part.text}-${idx}`}
					tw={
						part.type === 'asset'
							? 'text-emerald-600'
							: part.type === 'address'
								? 'text-blue-600'
								: 'text-gray-500'
					}
					style={{ whiteSpace: 'nowrap' }}
				>
					{part.text}
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
	if (
		!imageCache.bg ||
		!imageCache.logo ||
		!imageCache.receiptLogo ||
		!imageCache.nullIcon
	) {
		const [bgRes, logoRes, receiptLogoRes, nullIconRes] = await Promise.all([
			c.env.ASSETS.fetch(new Request('https://assets/bg-template.png')),
			c.env.ASSETS.fetch(new Request('https://assets/tempo-lockup.png')),
			c.env.ASSETS.fetch(new Request('https://assets/tempo-receipt.png')),
			c.env.ASSETS.fetch(new Request('https://assets/null.png')),
		])
		imageCache = {
			bg: await bgRes.arrayBuffer(),
			logo: await logoRes.arrayBuffer(),
			receiptLogo: await receiptLogoRes.arrayBuffer(),
			nullIcon: await nullIconRes.arrayBuffer(),
		}
	}
	const { bg, logo, receiptLogo, nullIcon } = imageCache as {
		bg: ArrayBuffer
		logo: ArrayBuffer
		receiptLogo: ArrayBuffer
		nullIcon: ArrayBuffer
	}
	return {
		bg: `data:image/png;base64,${Buffer.from(bg).toString('base64')}`,
		logo: `data:image/png;base64,${Buffer.from(logo).toString('base64')}`,
		receiptLogo: `data:image/png;base64,${Buffer.from(receiptLogo).toString('base64')}`,
		nullIcon: `data:image/png;base64,${Buffer.from(nullIcon).toString('base64')}`,
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
