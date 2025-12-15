import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { Hono } from 'hono'
import { Address, Hex } from 'ox'

import {
	parseAddressOgParams,
	parseTokenOgParams,
	parseTxOgParams,
	truncateText,
} from '#params.ts'

const FONT_MONO_URL =
	'https://unpkg.com/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2'
const FONT_INTER_URL =
	'https://unpkg.com/@fontsource/inter/files/inter-latin-500-normal.woff2'

const TOKENLIST_ICON_URL = 'https://tokenlist.tempo.xyz/icon'
const TESTNET_CHAIN_ID = 42429

const devicePixelRatio = 1.0

const CACHE_TTL = 3600

function isTxHash(value: string): boolean {
	return Hex.validate(value) && Hex.size(value as Hex.Hex) === 32
}

function getCacheKey(url: URL): Request {
	return new Request(url.toString(), { method: 'GET' })
}

// Global caches
let fontCache: { mono: ArrayBuffer | null; inter: ArrayBuffer | null } = {
	mono: null,
	inter: null,
}
let imageCache: {
	bg: ArrayBuffer | null
	bgTx: ArrayBuffer | null
	bgToken: ArrayBuffer | null
	bgAddress: ArrayBuffer | null
	bgContract: ArrayBuffer | null
	logo: ArrayBuffer | null
	receiptLogo: ArrayBuffer | null
	nullIcon: ArrayBuffer | null
} = {
	bg: null,
	bgTx: null,
	bgToken: null,
	bgAddress: null,
	bgContract: null,
	logo: null,
	receiptLogo: null,
	nullIcon: null,
}

let fontsInFlight: Promise<{ mono: ArrayBuffer; inter: ArrayBuffer }> | null =
	null
let imagesInFlight: Promise<void> | null = null

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
 * - e1..e6: Event strings in format "Action|Details|Amount" (optional 4th field: Message)
 *   Examples:
 *   - "Send|aUSD to|-$1.54|Thanks for the coffee."
 *   - "Swap|10 pathUSD for 10 AlphaUSD|$10|"
 *   - "Approve|for 0x1234...5678|$10|"
 *
 * Example URL:
 * /tx/0x123...?block=12331&sender=0x8f5a...3bc3&date=Dec 12 2025&time=16:00&fee=-$0.013&feeToken=aUSD&feePayer=0x8f5a...3bc3&total=-$1.55&e1=Send|aUSD to|-$1.54|Thanks for the coffee.
 */
app.get('/tx/:hash', async (c) => {
	const hash = c.req.param('hash')

	if (!hash || !isTxHash(hash)) {
		return new Response('Invalid transaction hash', { status: 400 })
	}

	const url = new URL(c.req.url)
	const params = url.searchParams
	const cacheKey = getCacheKey(url)
	const isDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

	// Check cache first (skip in dev)
	const cache = (caches as unknown as { default: Cache }).default
	if (!isDev) {
		const cachedResponse = await cache.match(cacheKey)
		if (cachedResponse) {
			return cachedResponse
		}
	}

	try {
		const txParams = parseTxOgParams(hash, params)

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
			events: txParams.events.map((e) => ({
				action: e.action,
				details: e.details,
				amount: e.amount,
				message: e.message,
			})),
		}

		// Fetch assets
		const [fonts, images] = await Promise.all([loadFonts(), loadImages(c)])

		const response = new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				{/* Background image - transaction template */}
				<img
					src={images.bgTx}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>

				{/* Receipt */}
				<div tw="absolute flex" style={{ left: '0', top: '40px' }}>
					<ReceiptCard data={receiptData} receiptLogo={images.receiptLogo} />
				</div>

				{/* Right side branding - now built into background template */}
				{/* <div
					tw="absolute flex flex-col ml-8"
					style={{ right: '56px', top: '80px', left: '790px', gap: '20px' }}
				>
					<img
						src={images.logo}
						alt="Tempo"
						style={{ width: '260px', height: '61px' }}
					/>
					<div
						tw="flex flex-col text-[32px] text-gray-500"
						style={{
							fontFamily: 'Inter',
							letterSpacing: '-0.02em',
							lineHeight: '1.35',
						}}
					>
						<span>View more about</span>
						<span>this transaction</span>
						<span>using the explorer →</span>
					</div>
				</div> */}
			</div>,
			{
				width: 1200 * devicePixelRatio,
				height: 630 * devicePixelRatio,
				format: 'png',
				module,
				fonts: [
					{ weight: 400, name: 'GeistMono', data: fonts.mono, style: 'normal' },
					{ weight: 500, name: 'Inter', data: fonts.inter, style: 'normal' },
				],
			},
		)

		const responseToCache = new Response(response.body, {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': isDev
					? 'no-store'
					: `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`,
			},
		})

		if (!isDev) {
			c.executionCtx.waitUntil(cache.put(cacheKey, responseToCache.clone()))
		}
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

	if (!address || !Address.validate(address)) {
		return new Response('Invalid token address', { status: 400 })
	}

	const url = new URL(c.req.url)
	const params = url.searchParams
	const cacheKey = getCacheKey(url)

	// Check cache first
	const cache = (caches as unknown as { default: Cache }).default
	const cachedResponse = await cache.match(cacheKey)
	if (cachedResponse) {
		return cachedResponse
	}

	try {
		const tokenParams = parseTokenOgParams(address, params)

		const tokenData: TokenData = {
			address: tokenParams.address,
			name: tokenParams.name,
			symbol: tokenParams.symbol,
			currency: tokenParams.currency,
			holders: tokenParams.holders,
			supply: tokenParams.supply,
			created: tokenParams.created,
			quoteToken: tokenParams.quoteToken,
			isFeeToken: tokenParams.isFeeToken,
		}

		// Fetch assets and token icon in parallel
		const [fonts, images, tokenIcon] = await Promise.all([
			loadFonts(),
			loadImages(c),
			fetchTokenIcon(address),
		])

		const response = new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				{/* Background image - token template */}
				<img
					src={images.bgToken}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>

				{/* Token Card */}
				<div tw="absolute flex" style={{ left: '0', top: '40px' }}>
					<TokenCard data={tokenData} icon={tokenIcon || images.nullIcon} />
				</div>

				{/* Right side branding - now built into background template */}
				{/* <div
					tw="absolute flex flex-col ml-8"
					style={{ right: '56px', top: '80px', left: '790px', gap: '20px' }}
				>
					<img
						src={images.logo}
						alt="Tempo"
						style={{ width: '260px', height: '61px' }}
					/>
					<div
						tw="flex flex-col text-[32px] text-gray-500"
						style={{
							fontFamily: 'Inter',
							letterSpacing: '-0.02em',
							lineHeight: '1.35',
						}}
					>
						<span>View more about</span>
						<span>this asset using</span>
						<span>the explorer →</span>
					</div>
				</div> */}
			</div>,
			{
				width: 1200 * devicePixelRatio,
				height: 630 * devicePixelRatio,
				format: 'png',
				module,
				fonts: [
					{ weight: 400, name: 'GeistMono', data: fonts.mono, style: 'normal' },
					{ weight: 500, name: 'Inter', data: fonts.inter, style: 'normal' },
				],
			},
		)

		const responseToCache = new Response(response.body, {
			headers: {
				'Content-Type': 'image/png',
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
 * - lastActive: Last activity datetime (e.g., "Dec 12 2025 16:00")
 * - created: Account creation datetime (e.g., "Nov 1 2025 10:30")
 * - feeToken: Fee token symbol (e.g., "pathUSD")
 * - tokens: Comma-separated list of token symbols held (e.g., "AUSD,BUSD,CUSD")
 */
app.get('/address/:address', async (c) => {
	const address = c.req.param('address')

	if (!address || !Address.validate(address)) {
		return new Response('Invalid address', { status: 400 })
	}

	const url = new URL(c.req.url)
	const params = url.searchParams
	const cacheKey = getCacheKey(url)

	const cache = (caches as unknown as { default: Cache }).default
	const cachedResponse = await cache.match(cacheKey)
	if (cachedResponse) {
		return cachedResponse
	}

	try {
		const addrParams = parseAddressOgParams(address, params)

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

		// Fetch assets
		const [fonts, images] = await Promise.all([loadFonts(), loadImages(c)])

		// Choose background based on whether it's a contract or address
		const bgImage = addressData.isContract
			? images.bgContract
			: images.bgAddress

		const response = new ImageResponse(
			<div tw="flex w-full h-full relative" style={{ fontFamily: 'Inter' }}>
				{/* Background image - address or contract template */}
				<img
					src={bgImage}
					alt=""
					tw="absolute inset-0 w-full h-full"
					style={{ objectFit: 'cover' }}
				/>

				{/* Address Card */}
				<div tw="absolute flex" style={{ left: '0', top: '40px' }}>
					<AddressCard data={addressData} />
				</div>

				{/* Right side branding - now built into background template */}
				{/* <div
					tw="absolute flex flex-col ml-8"
					style={{ right: '56px', top: '80px', left: '790px', gap: '20px' }}
				>
					<img
						src={images.logo}
						alt="Tempo"
						style={{ width: '260px', height: '61px' }}
					/>
					<div
						tw="flex flex-col text-[32px] text-gray-500"
						style={{
							fontFamily: 'Inter',
							letterSpacing: '-0.02em',
							lineHeight: '1.35',
						}}
					>
						<span>View more about</span>
						<span>this address using</span>
						<span>the explorer →</span>
					</div>
				</div> */}
			</div>,
			{
				width: 1200 * devicePixelRatio,
				height: 630 * devicePixelRatio,
				format: 'png',
				module,
				fonts: [
					{ weight: 400, name: 'GeistMono', data: fonts.mono, style: 'normal' },
					{ weight: 500, name: 'Inter', data: fonts.inter, style: 'normal' },
				],
			},
		)

		const responseToCache = new Response(response.body, {
			headers: {
				'Content-Type': 'image/png',
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
	isFeeToken?: boolean
}

interface AddressData {
	address: string
	holdings: string
	txCount: string
	lastActive: string
	created: string
	feeToken?: string
	tokensHeld: string[] // Array of token symbols
	isContract: boolean // Whether this is a contract address
	methods?: string[] // Contract methods detected
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
	// Format date to "Dec 1 2025" format
	let formattedDate = data.date
	// Handle "Dec 1, 2025" format - remove comma
	if (data.date.includes(',')) {
		formattedDate = data.date.replace(',', '')
	}
	// Handle "12/01/2025" or "MM/DD/YYYY" format - convert to "Dec 1 2025"
	const dateMatch = data.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
	if (dateMatch) {
		const [, monthStr, dayStr, year] = dateMatch
		const month = Number.parseInt(monthStr ?? '1', 10)
		const day = Number.parseInt(dayStr ?? '1', 10)
		const monthNames = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec',
		]
		formattedDate = `${monthNames[month - 1]} ${day} ${year}`
	}

	// Format time to "HH:MM" (24-hour)
	let formattedTime = data.time
	// Handle "1:03 PM" or "10:32 AM GMT-8" format (12-hour with optional timezone)
	const timeMatch12 = data.time.match(
		/^(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s*GMT[+-]\d+)?$/i,
	)
	if (timeMatch12) {
		const hoursStr = timeMatch12[1]
		const minutes = timeMatch12[2]
		const periodRaw = timeMatch12[3]
		if (hoursStr && minutes && periodRaw) {
			let hours = Number.parseInt(hoursStr, 10)
			const period = periodRaw.toUpperCase()
			if (period === 'PM' && hours !== 12) hours += 12
			if (period === 'AM' && hours === 12) hours = 0
			formattedTime = `${hours.toString().padStart(2, '0')}:${minutes}`
		}
	}
	// Handle "10:32:21 GMT-8" format (24-hour) - extract HH:MM
	else {
		const timeMatch24 = data.time.match(
			/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:GMT[+-]\d+)?$/i,
		)
		if (timeMatch24) {
			const hours = timeMatch24[1]
			const minutes = timeMatch24[2]
			formattedTime = `${hours?.padStart(2, '0')}:${minutes}`
		}
	}

	// Combine date and time
	const when = data.date !== '—' ? `${formattedDate} ${formattedTime}` : '—'

	return (
		<div
			tw="flex flex-col bg-white"
			style={{
				width: '700px',
				maxWidth: '700px',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderBottomRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
			}}
		>
			{/* Header */}
			<div
				tw="flex w-full pr-8 pt-10 pb-8"
				style={{ gap: '27px', paddingLeft: '48px' }}
			>
				{/* Tempo Receipt logo */}
				<div tw="flex shrink-0 items-start">
					<img
						src={receiptLogo}
						alt="Tempo Receipt"
						style={{ width: '190px', height: 'auto' }}
					/>
				</div>

				{/* Details - condensed */}
				<div
					tw="flex flex-col flex-1 text-[28px]"
					style={{
						fontFamily: 'GeistMono',
						gap: '20px',
						marginLeft: '16px',
						letterSpacing: '-0.02em',
					}}
				>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500 shrink-0">Block</span>
						<span tw="text-emerald-600">#{data.blockNumber}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500 shrink-0">Sender</span>
						<span tw="text-blue-500">{truncateHash(data.sender, 6)}</span>
					</div>
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500 shrink-0">Date</span>
						<span>{when}</span>
					</div>
				</div>
			</div>

			{/* Divider */}
			<div
				tw="flex mr-10"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					marginLeft: '56px',
				}}
			/>

			{/* Events - show max 3, then "...and n more" */}
			{data.events.length > 0 &&
				data.events.slice(0, 3).map((event, index) => {
					const parts = parseEventDetails(event.details || '')
					return (
						<div
							key={`event-${event.details}`}
							tw="flex px-12 py-4 text-[28px]"
							style={{
								fontFamily: 'GeistMono',
								letterSpacing: '-0.02em',
								justifyContent: 'space-between',
							}}
						>
							<div tw="flex" style={{ gap: '8px', maxWidth: '85%' }}>
								<span tw="text-gray-500 shrink-0">{index + 1}.</span>
								<div tw="flex flex-wrap" style={{ gap: '8px' }}>
									<span tw="bg-gray-100 px-3 py-1 rounded shrink-0">
										{event.action}
									</span>
									{parts.map((part) => (
										<span
											key={`part-${part.text}`}
											tw={
												part.type === 'asset'
													? 'text-emerald-600'
													: part.type === 'address'
														? 'text-blue-600'
														: 'text-gray-500'
											}
										>
											{part.text}
										</span>
									))}
								</div>
							</div>
							{event.amount && <span tw="shrink-0">{event.amount}</span>}
						</div>
					)
				})}
			{data.events.length > 3 && (
				<div
					tw="flex justify-center py-3 mx-12 text-gray-500 text-[24px]"
					style={{ fontFamily: 'GeistMono' }}
				>
					...and {data.events.length - 3} more
				</div>
			)}

			{/* Divider */}
			<div
				tw="flex mr-10"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					marginLeft: '56px',
				}}
			/>

			{/* Fee and Total rows */}
			{(data.fee || data.total) && (
				<>
					<div
						tw="flex"
						style={{
							height: '1px',
							backgroundColor: '#d1d5db',
							marginLeft: '48px',
						}}
					/>
					<div
						tw="flex flex-col pr-8 pb-12 text-[28px]"
						style={{
							fontFamily: 'GeistMono',
							gap: '22px',
							width: '100%',
							letterSpacing: '-0.02em',
							paddingTop: '24px',
							paddingBottom: '32px',
						}}
					>
						{data.fee && (
							<div
								tw="flex items-center"
								style={{ width: '100%', justifyContent: 'space-between' }}
							>
								<span tw="text-gray-500">
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
								<span tw="text-gray-500">Total</span>
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
			tw="flex flex-col bg-white"
			style={{
				width: '700px',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderBottomRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
			}}
		>
			{/* Header with icon and name */}
			<div
				tw="flex items-center pr-10 pt-14 pb-12"
				style={{ gap: '20px', paddingLeft: '56px' }}
			>
				{/* Token icon from tokenlist or fallback to null icon */}
				<img
					src={icon}
					alt=""
					tw="rounded-full"
					style={{ width: '80px', height: '80px' }}
				/>
				<div tw="flex flex-col flex-1" style={{ overflow: 'hidden' }}>
					<span tw="text-5xl font-semibold text-gray-900">
						{truncateText(data.name, 18)}
					</span>
				</div>
				{/* Symbol badge */}
				<div tw="flex items-center shrink-0" style={{ gap: '12px' }}>
					<div
						tw="flex items-center px-5 py-3 bg-gray-100 rounded-lg text-gray-600 text-2xl"
						style={{ fontFamily: 'GeistMono' }}
					>
						{truncateText(data.symbol, 12)}
					</div>
					{data.isFeeToken && (
						<div
							tw="flex items-center px-5 py-3 bg-emerald-100 rounded-lg text-emerald-700 text-2xl"
							style={{ fontFamily: 'GeistMono' }}
						>
							Fee Token
						</div>
					)}
				</div>
			</div>

			{/* Divider */}
			<div
				tw="flex mr-10"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					marginLeft: '56px',
				}}
			/>

			{/* Details */}
			<div
				tw="flex flex-col pr-10 py-10 text-[29px]"
				style={{
					fontFamily: 'GeistMono',
					gap: '29px',
					letterSpacing: '-0.02em',
					paddingLeft: '56px',
				}}
			>
				{/* Address - truncated */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Address</span>
					<span tw="text-blue-500">{truncateHash(data.address, 8)}</span>
				</div>

				{/* Currency */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Currency</span>
					<span tw="text-gray-900">{truncateText(data.currency, 16)}</span>
				</div>

				{/* Holders */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Holders</span>
					<span tw="text-gray-900">{truncateText(data.holders, 16)}</span>
				</div>

				{/* Supply */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Supply</span>
					<span tw="text-gray-900">{truncateText(data.supply, 20)}</span>
				</div>

				{/* Created */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Created</span>
					<span tw="text-gray-900">{data.created}</span>
				</div>

				{/* Quote Token (if available) */}
				{data.quoteToken && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Quote Token</span>
						<span tw="text-gray-900">{data.quoteToken}</span>
					</div>
				)}
			</div>
		</div>
	)
}

// ============ Token Badges Helper ============

function TokenBadges({
	tokens,
	maxTokens = 4,
}: {
	tokens: string[]
	maxTokens?: number
}) {
	// Truncate token name if too long
	const truncateToken = (token: string, maxLen = 8) => {
		if (token.length <= maxLen) return token
		return `${token.slice(0, maxLen - 1)}…`
	}

	// Show up to maxTokens tokens
	const displayTokens = tokens.slice(0, maxTokens)
	const remaining = tokens.length - maxTokens

	return (
		<>
			{displayTokens.map((token) => (
				<span
					key={token}
					tw="flex px-4 py-2 bg-gray-100 rounded text-gray-700 text-[23px]"
					style={{
						fontFamily: 'GeistMono',
						marginRight: '12px',
					}}
				>
					{truncateToken(token)}
				</span>
			))}
			{remaining > 0 && (
				<span
					tw="flex px-4 py-2 bg-gray-100 rounded text-gray-500 text-[23px]"
					style={{ fontFamily: 'GeistMono' }}
				>
					+{remaining}
				</span>
			)}
		</>
	)
}

// ============ Method Badges Helper ============

function MethodBadges({ methods }: { methods: string[] }) {
	// Split methods into rows based on character count (~40 chars per row)
	const maxCharsPerRow = 40
	const row1: string[] = []
	const row2: string[] = []
	let row1Chars = 0
	let row2Chars = 0

	for (const m of methods) {
		if (row1Chars + m.length <= maxCharsPerRow || row1.length === 0) {
			row1.push(m)
			row1Chars += m.length + 2
		} else if (row2Chars + m.length <= maxCharsPerRow || row2.length === 0) {
			row2.push(m)
			row2Chars += m.length + 2
		} else {
			break
		}
	}

	const displayed = row1.length + row2.length
	const remaining = methods.length - displayed

	// Truncate method name if too long
	const truncateMethod = (m: string, maxLen = 14) => {
		if (m.length <= maxLen) return m
		return `${m.slice(0, maxLen - 1)}…`
	}

	const renderBadge = (m: string, idx: number) => (
		<span
			key={idx}
			tw="px-4 py-2 bg-gray-100 rounded text-gray-700 text-[23px]"
			style={{ fontFamily: 'GeistMono' }}
		>
			{truncateMethod(m)}
		</span>
	)

	return (
		<div tw="flex flex-col items-end" style={{ gap: '8px' }}>
			{/* Row 1 */}
			<div tw="flex justify-end" style={{ gap: '10px' }}>
				{row1[0] && renderBadge(row1[0], 0)}
				{row1[1] && renderBadge(row1[1], 1)}
				{row1[2] && renderBadge(row1[2], 2)}
				{row1[3] && renderBadge(row1[3], 3)}
			</div>
			{/* Row 2 */}
			{row2.length > 0 && (
				<div tw="flex justify-end" style={{ gap: '10px' }}>
					{row2[0] && renderBadge(row2[0], 10)}
					{row2[1] && renderBadge(row2[1], 11)}
					{row2[2] && renderBadge(row2[2], 12)}
					{row2[3] && renderBadge(row2[3], 13)}
					{remaining > 0 && (
						<span
							tw="px-4 py-2 bg-gray-100 rounded text-gray-500 text-[23px]"
							style={{ fontFamily: 'GeistMono' }}
						>
							+{remaining}
						</span>
					)}
				</div>
			)}
			{/* +remaining if only one row */}
			{row2.length === 0 && remaining > 0 && (
				<div tw="flex justify-end" style={{ gap: '10px' }}>
					<span
						tw="px-4 py-2 bg-gray-100 rounded text-gray-500 text-[23px]"
						style={{ fontFamily: 'GeistMono' }}
					>
						+{remaining}
					</span>
				</div>
			)}
		</div>
	)
}

// ============ Address Card Component ============

function AddressCard({ data }: { data: AddressData }) {
	// Split address into two lines for display
	const addrLine1 = data.address.slice(0, 22)
	const addrLine2 = data.address.slice(22)

	return (
		<div
			tw="flex flex-col bg-white"
			style={{
				width: '700px',
				boxShadow:
					'0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.08)',
				borderTopRightRadius: '24px',
				borderBottomRightRadius: '24px',
				borderTopLeftRadius: '0',
				borderBottomLeftRadius: '0',
			}}
		>
			{/* Address header */}
			<div
				tw="flex w-full pr-10 pt-10 pb-8 justify-between items-start"
				style={{ paddingLeft: '56px' }}
			>
				<span
					tw="text-gray-500 text-[29px]"
					style={{ fontFamily: 'GeistMono' }}
				>
					{data.isContract ? 'Contract' : 'Address'}
				</span>
				<div
					tw="flex flex-col items-end text-[29px] text-blue-500"
					style={{ fontFamily: 'GeistMono', lineHeight: '1.3' }}
				>
					<span>{addrLine1}</span>
					<span>{addrLine2}</span>
				</div>
			</div>

			{/* Divider - dashed */}
			<div
				tw="flex mr-10"
				style={{
					height: '1px',
					backgroundColor: '#d1d5db',
					borderStyle: 'dashed',
					marginLeft: '56px',
				}}
			/>

			{/* Details */}
			<div
				tw="flex flex-col pr-10 py-8 text-[29px]"
				style={{
					fontFamily: 'GeistMono',
					gap: '22px',
					letterSpacing: '-0.02em',
					paddingLeft: '56px',
				}}
			>
				{/* Holdings - show for EOAs only */}
				{!data.isContract && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Holdings</span>
						<span tw="text-gray-900">{truncateText(data.holdings, 20)}</span>
					</div>
				)}

				{/* Tokens Held section - show for EOAs only */}
				{data.tokensHeld.length > 0 && !data.isContract && (
					<div tw="flex flex-col w-full items-end" style={{ marginTop: '8px' }}>
						{/* Single row of tokens */}
						<div tw="flex justify-end py-1" style={{ width: '100%' }}>
							<TokenBadges tokens={data.tokensHeld} maxTokens={4} />
						</div>
						{/* Divider - dashed */}
						<div
							tw="flex w-full"
							style={{
								height: '1px',
								backgroundColor: '#d1d5db',
								borderStyle: 'dashed',
								marginTop: '16px',
							}}
						/>
					</div>
				)}

				{/* Divider - dashed (when no tokens and not contract) */}
				{data.tokensHeld.length === 0 && !data.isContract && (
					<div
						tw="flex w-full"
						style={{
							height: '1px',
							backgroundColor: '#d1d5db',
							borderStyle: 'dashed',
						}}
					/>
				)}

				{/* Transactions */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Transactions</span>
					<span tw="text-gray-900">{data.txCount}</span>
				</div>

				{/* Last Active */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Last Active</span>
					<span tw="text-gray-900">{data.lastActive}</span>
				</div>

				{/* Created */}
				<div tw="flex w-full justify-between">
					<span tw="text-gray-500">Created</span>
					<span tw="text-gray-900">{data.created}</span>
				</div>

				{/* Fee Token - hide for contracts */}
				{!data.isContract && (
					<div tw="flex w-full justify-between">
						<span tw="text-gray-500">Fee Token</span>
						<span tw="text-gray-900">{data.feeToken}</span>
					</div>
				)}

				{/* Contract Methods - show for contracts only, at bottom */}
				{data.isContract && data.methods && data.methods.length > 0 && (
					<div tw="flex flex-col w-full" style={{ marginTop: '4px' }}>
						<span tw="text-gray-500" style={{ marginBottom: '12px' }}>
							Methods
						</span>
						<MethodBadges methods={data.methods || []} />
					</div>
				)}
			</div>
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

// Parse event details into groups for rendering
function parseEventDetails(
	details: string,
): { text: string; type: 'normal' | 'asset' | 'address' }[] {
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

	return groups
}

// Render a single detail part with appropriate styling
function _DetailPart({
	part,
	idx,
}: {
	part: { text: string; type: 'normal' | 'asset' | 'address' }
	idx: number
}) {
	return (
		<span
			key={`${part.text}-${idx}`}
			tw={
				part.type === 'asset'
					? 'text-emerald-600'
					: part.type === 'address'
						? 'text-blue-600'
						: 'text-gray-500'
			}
			style={{ whiteSpace: 'nowrap', lineHeight: '34px' }}
		>
			{part.text}
		</span>
	)
}

// ============ Asset Loading ============

async function loadFonts() {
	if (!fontCache.mono || !fontCache.inter) {
		if (!fontsInFlight) {
			fontsInFlight = Promise.all([
				fetch(FONT_MONO_URL).then((r) => r.arrayBuffer()),
				fetch(FONT_INTER_URL).then((r) => r.arrayBuffer()),
			]).then(([mono, inter]) => {
				fontCache = { mono, inter }
				return { mono, inter }
			})
		}
		await fontsInFlight
		fontsInFlight = null
	}
	return fontCache as { mono: ArrayBuffer; inter: ArrayBuffer }
}

async function loadImages(c: { env: Cloudflare.Env }) {
	if (
		!imageCache.bg ||
		!imageCache.bgTx ||
		!imageCache.bgToken ||
		!imageCache.bgAddress ||
		!imageCache.bgContract ||
		!imageCache.logo ||
		!imageCache.receiptLogo ||
		!imageCache.nullIcon
	) {
		if (!imagesInFlight) {
			imagesInFlight = (async () => {
				const [
					bgRes,
					bgTxRes,
					bgTokenRes,
					bgAddressRes,
					bgContractRes,
					logoRes,
					receiptLogoRes,
					nullIconRes,
				] = await Promise.all([
					c.env.ASSETS.fetch(new Request('https://assets/bg-template.png')),
					c.env.ASSETS.fetch(
						new Request('https://assets/bg-template-transaction.png'),
					),
					c.env.ASSETS.fetch(
						new Request('https://assets/bg-template-token.png'),
					),
					c.env.ASSETS.fetch(
						new Request('https://assets/bg-template-address.png'),
					),
					c.env.ASSETS.fetch(
						new Request('https://assets/bg-template-contract.png'),
					),
					c.env.ASSETS.fetch(new Request('https://assets/tempo-lockup.png')),
					c.env.ASSETS.fetch(new Request('https://assets/tempo-receipt.png')),
					c.env.ASSETS.fetch(new Request('https://assets/null.png')),
				])
				imageCache = {
					bg: await bgRes.arrayBuffer(),
					bgTx: await bgTxRes.arrayBuffer(),
					bgToken: await bgTokenRes.arrayBuffer(),
					bgAddress: await bgAddressRes.arrayBuffer(),
					bgContract: await bgContractRes.arrayBuffer(),
					logo: await logoRes.arrayBuffer(),
					receiptLogo: await receiptLogoRes.arrayBuffer(),
					nullIcon: await nullIconRes.arrayBuffer(),
				}
			})()
		}
		await imagesInFlight
		imagesInFlight = null
	}
	const {
		bg,
		bgTx,
		bgToken,
		bgAddress,
		bgContract,
		logo,
		receiptLogo,
		nullIcon,
	} = imageCache as {
		bg: ArrayBuffer
		bgTx: ArrayBuffer
		bgToken: ArrayBuffer
		bgAddress: ArrayBuffer
		bgContract: ArrayBuffer
		logo: ArrayBuffer
		receiptLogo: ArrayBuffer
		nullIcon: ArrayBuffer
	}
	return {
		bg: `data:image/png;base64,${Buffer.from(bg).toString('base64')}`,
		bgTx: `data:image/png;base64,${Buffer.from(bgTx).toString('base64')}`,
		bgToken: `data:image/png;base64,${Buffer.from(bgToken).toString('base64')}`,
		bgAddress: `data:image/png;base64,${Buffer.from(bgAddress).toString('base64')}`,
		bgContract: `data:image/png;base64,${Buffer.from(bgContract).toString('base64')}`,
		logo: `data:image/png;base64,${Buffer.from(logo).toString('base64')}`,
		receiptLogo: `data:image/png;base64,${Buffer.from(receiptLogo).toString('base64')}`,
		nullIcon: `data:image/png;base64,${Buffer.from(nullIcon).toString('base64')}`,
	}
}

export default app satisfies ExportedHandler<Cloudflare.Env>
