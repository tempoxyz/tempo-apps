import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { Hono } from 'hono'
import { Address, type Hex, Value } from 'ox'
import { Abis, Addresses } from 'tempo.ts/viem'
import { parseEventLogs, type TransactionReceipt, zeroAddress } from 'viem'

const FONT_MONO_URL =
	'https://unpkg.com/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2'
const FONT_INTER_URL =
	'https://unpkg.com/@fontsource/inter/files/inter-latin-500-normal.woff2'

const RPC_URL = 'https://rpc-orchestra.testnet.tempo.xyz'
const devicePixelRatio = 1.0

// Cache TTL: 1 hour for OG images
const CACHE_TTL = 3600

// Global caches
let fontCache: { mono: ArrayBuffer | null; inter: ArrayBuffer | null } = {
	mono: null,
	inter: null,
}
let imageCache: { bg: ArrayBuffer | null; logo: ArrayBuffer | null } = {
	bg: null,
	logo: null,
}

const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.get('/favicon.ico', () =>
	Response.redirect('https://docs.tempo.xyz/icon-light.png'),
)

app.get('/health', () => new Response('OK'))

// Transaction OG image
app.get('/tx/:hash', async (c) => {
	const hash = c.req.param('hash') as Hex.Hex

	if (!hash || !hash.startsWith('0x') || hash.length !== 66) {
		return new Response('Invalid transaction hash', { status: 400 })
	}

	const url = new URL(c.req.url)
	const cacheKey = new Request(url.toString(), c.req.raw)

	// Check cache first
	const cache = (caches as unknown as { default: Cache }).default
	const cachedResponse = await cache.match(cacheKey)
	if (cachedResponse) {
		return cachedResponse
	}

	try {
		// Fetch everything in parallel
		const [fonts, images, receiptData] = await Promise.all([
			loadFonts(),
			loadImages(c),
			fetchReceiptData(hash),
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

				{/* Receipt */}
				<div
					tw="absolute flex"
					style={{ left: '32px', top: '24px', bottom: '0' }}
				>
					<ReceiptCard data={receiptData} />
				</div>

				{/* Right side branding */}
				<div
					tw="absolute flex flex-col gap-4"
					style={{ right: '40px', top: '140px', left: '420px' }}
				>
					<img
						src={images.logo}
						alt="Tempo"
						tw="mb-4"
						style={{ width: '180px', height: '42px' }}
					/>
					<div
						tw="flex flex-col text-[32px] text-gray-600 leading-tight"
						style={{ fontFamily: 'Inter', letterSpacing: '-0.02em' }}
					>
						<span>View more about this</span>
						<span>transaction using</span>
						<div tw="flex items-center gap-3">
							<span>the explorer</span>
							<span tw="text-black text-[38px]">→</span>
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

// ============ Receipt Component ============

interface ReceiptData {
	blockNumber: bigint
	sender: string
	hash: string
	timestamp: bigint
	events: ParsedEvent[]
	feeDisplay?: string
	totalDisplay?: string
}

interface ParsedEvent {
	type: string
	action: string
	details: string
	amount?: string
}

function ReceiptCard({ data }: { data: ReceiptData }) {
	const date = formatDate(data.timestamp)
	const time = formatTime(data.timestamp)

	return (
		<div
			tw="flex flex-col bg-white rounded-t-2xl shadow-2xl"
			style={{
				width: '360px',
				boxShadow: '0 8px 60px rgba(0,0,0,0.12)',
			}}
		>
			{/* Header */}
			<div tw="flex px-5 pt-6 pb-4">
				{/* Logo */}
				<div tw="flex flex-col shrink-0 mr-8">
					<div tw="flex text-[18px] font-bold" style={{ fontFamily: 'Inter' }}>
						Tempo
					</div>
					<div
						tw="flex text-[10px] text-gray-400 tracking-widest"
						style={{ fontFamily: 'GeistMono' }}
					>
						RECEIPT
					</div>
				</div>

				{/* Details */}
				<div
					tw="flex flex-col flex-1 text-[13px]"
					style={{ fontFamily: 'GeistMono', gap: '6px' }}
				>
					<div tw="flex justify-between">
						<span tw="text-gray-400">Block</span>
						<span tw="text-emerald-600">#{String(data.blockNumber)}</span>
					</div>
					<div tw="flex justify-between">
						<span tw="text-gray-400">Sender</span>
						<span tw="text-emerald-600">{truncateHash(data.sender)}</span>
					</div>
					<div tw="flex justify-between">
						<span tw="text-gray-400">Hash</span>
						<span>{truncateHash(data.hash)}</span>
					</div>
					<div tw="flex justify-between">
						<span tw="text-gray-400">Date</span>
						<span>{date}</span>
					</div>
					<div tw="flex justify-between">
						<span tw="text-gray-400">Time</span>
						<span>{time}</span>
					</div>
				</div>
			</div>

			{/* Events */}
			{data.events.length > 0 && (
				<>
					<div
						tw="flex mx-5"
						style={{
							borderTop: '1px dashed #e5e7eb',
						}}
					/>
					<div
						tw="flex flex-col px-5 py-4"
						style={{ fontFamily: 'GeistMono', gap: '10px' }}
					>
						{data.events.slice(0, 4).map((event, index) => (
							<div
								key={`${event.type}-${event.action}-${index}`}
								tw="flex justify-between text-[13px]"
							>
								<div tw="flex items-center" style={{ gap: '6px' }}>
									<span tw="text-gray-400">{index + 1}.</span>
									<span tw="flex bg-gray-100 px-1.5 py-0.5 text-[12px]">
										{event.action}
									</span>
									<span tw="text-gray-500 text-[12px]">{event.details}</span>
								</div>
								{event.amount && <span>{event.amount}</span>}
							</div>
						))}
					</div>
				</>
			)}

			{/* Totals */}
			{(data.feeDisplay || data.totalDisplay) && (
				<>
					<div
						tw="flex mx-5"
						style={{
							borderTop: '1px dashed #e5e7eb',
						}}
					/>
					<div
						tw="flex flex-col px-5 py-4"
						style={{ fontFamily: 'GeistMono', gap: '6px' }}
					>
						{data.feeDisplay && (
							<div tw="flex justify-between text-[13px]">
								<span tw="text-gray-400">Fee</span>
								<span>{data.feeDisplay}</span>
							</div>
						)}
						{data.totalDisplay && (
							<div tw="flex justify-between text-[13px]">
								<span tw="text-gray-400">Total</span>
								<span>{data.totalDisplay}</span>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}

// ============ Data Fetching ============

async function fetchReceiptData(hash: Hex.Hex): Promise<ReceiptData> {
	const [receipt, _block] = await Promise.all([
		rpcCall<TransactionReceipt>('eth_getTransactionReceipt', [hash]),
		rpcCall<{ timestamp: string }>('eth_getBlockByHash', [null, false]).catch(
			() => null,
		),
	])

	if (!receipt) {
		throw new Error('Transaction receipt not found')
	}

	// Get block for timestamp
	const blockData = await rpcCall<{ timestamp: string }>('eth_getBlockByHash', [
		receipt.blockHash,
		false,
	])

	const timestamp = BigInt(blockData?.timestamp || '0')
	const events = parseEvents(receipt)
	const { feeDisplay, totalDisplay } = calculateFees(receipt)

	return {
		blockNumber: BigInt(receipt.blockNumber),
		sender: receipt.from,
		hash,
		timestamp,
		events,
		feeDisplay,
		totalDisplay,
	}
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
	const response = await fetch(RPC_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
	})
	const data = (await response.json()) as {
		result: T
		error?: { message: string }
	}
	if (data.error) throw new Error(data.error.message)
	return data.result
}

// ============ Event Parsing ============

const abi = Object.values(Abis).flat()

function parseEvents(receipt: TransactionReceipt): ParsedEvent[] {
	const events: ParsedEvent[] = []

	try {
		const parsedLogs = parseEventLogs({ abi, logs: receipt.logs })

		for (const log of parsedLogs) {
			const event = parseLogToEvent(log, receipt.from)
			if (event) events.push(event)
		}
	} catch (e) {
		// If parsing fails, return empty events
		console.error('Event parsing error:', e)
	}

	return events
}

function parseLogToEvent(
	log: ReturnType<typeof parseEventLogs<typeof abi>>[number],
	_sender: string,
): ParsedEvent | null {
	const { eventName, args } = log

	if (eventName === 'Transfer' || eventName === 'TransferWithMemo') {
		const { amount, from, to } = args as {
			amount: bigint
			from: string
			to: string
		}

		// Check if it's a fee transfer
		if (
			Address.isEqual(to as Address.Address, Addresses.feeManager) &&
			!Address.isEqual(from as Address.Address, zeroAddress)
		) {
			return null // Skip fee transfers, handled in totals
		}

		// Check if it's a swap (to stablecoin exchange)
		if (Address.isEqual(to as Address.Address, Addresses.stablecoinExchange)) {
			return {
				type: 'swap',
				action: 'Swap',
				details: `${formatAmount(amount)} for ...`,
				amount: formatPrice(amount),
			}
		}

		return {
			type: 'send',
			action: 'Send',
			details: `to ${truncateHash(to)}`,
			amount: formatPrice(amount),
		}
	}

	if (eventName === 'Approval') {
		const { amount, spender } = args as { amount: bigint; spender: string }
		return {
			type: 'approval',
			action: 'Approve',
			details: `for ${truncateHash(spender)}`,
			amount: formatPrice(amount),
		}
	}

	if (eventName === 'Mint' && 'amount' in args) {
		const { amount, to } = args as { amount: bigint; to: string }
		return {
			type: 'mint',
			action: 'Mint',
			details: `to ${truncateHash(to)}`,
			amount: formatPrice(amount),
		}
	}

	if (eventName === 'Burn' && 'amount' in args) {
		const { amount, from } = args as { amount: bigint; from: string }
		return {
			type: 'burn',
			action: 'Burn',
			details: `from ${truncateHash(from)}`,
			amount: formatPrice(amount),
		}
	}

	if (eventName === 'OrderFilled') {
		const { partialFill, amountFilled } = args as {
			partialFill: boolean
			amountFilled: bigint
		}
		return {
			type: 'order_filled',
			action: partialFill ? 'Partial Fill' : 'Fill',
			details: String(amountFilled),
		}
	}

	return null
}

function calculateFees(receipt: TransactionReceipt): {
	feeDisplay?: string
	totalDisplay?: string
} {
	let totalFee = 0n

	try {
		const parsedLogs = parseEventLogs({ abi, logs: receipt.logs })

		for (const log of parsedLogs) {
			if (
				log.eventName === 'Transfer' ||
				log.eventName === 'TransferWithMemo'
			) {
				const { amount, from, to } = log.args as {
					amount: bigint
					from: string
					to: string
				}

				if (
					Address.isEqual(to as Address.Address, Addresses.feeManager) &&
					!Address.isEqual(from as Address.Address, zeroAddress)
				) {
					totalFee += amount
				}
			}
		}
	} catch (e) {
		console.error('Fee calculation error:', e)
	}

	if (totalFee === 0n) return {}

	const feeDisplay = formatPrice(totalFee)
	return { feeDisplay, totalDisplay: feeDisplay }
}

// ============ Formatting Helpers ============

function truncateHash(hash: string, chars = 4): string {
	if (hash.length <= chars * 2 + 2) return hash
	return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`
}

function formatDate(timestamp: bigint): string {
	const date = new Date(Number(timestamp) * 1000)
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	})
}

function formatTime(timestamp: bigint): string {
	const date = new Date(Number(timestamp) * 1000)
	return `${date.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	})} GMT+0`
}

function formatAmount(value: bigint, decimals = 6): string {
	const formatted = Number(Value.format(value, decimals))
	if (formatted > 0 && formatted < 0.01) return '<0.01'
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(formatted)
}

function formatPrice(value: bigint, decimals = 6): string {
	const formatted = Number(Value.format(value, decimals))
	if (formatted > 0 && formatted < 0.01) return '<$0.01'
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(formatted)
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
	const { bg, logo } = imageCache as { bg: ArrayBuffer; logo: ArrayBuffer }
	return {
		bg: `data:image/png;base64,${Buffer.from(bg).toString('base64')}`,
		logo: `data:image/png;base64,${Buffer.from(logo).toString('base64')}`,
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
