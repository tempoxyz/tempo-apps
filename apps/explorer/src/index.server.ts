import * as Sentry from '@sentry/cloudflare'
import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'
import type { Address } from 'ox'
import type { TransactionReceipt } from 'viem'
import {
	type KnownEvent,
	type KnownEventPart,
	parseKnownEvents,
	preferredEventsFilter,
} from '#lib/domain/known-events'

const OG_BASE_URL = 'https://og.porto.workers.dev'
const RPC_URL = 'https://rpc-orchestra.testnet.tempo.xyz'

// Remove existing OG meta tags so we can inject transaction-specific ones
class OgMetaRemover {
	element(element: Element) {
		const property = element.getAttribute('property')
		const name = element.getAttribute('name')

		// Remove existing og:title, og:image, og:description and twitter tags
		if (
			property?.startsWith('og:') ||
			name?.startsWith('og:') ||
			name?.startsWith('twitter:')
		) {
			element.remove()
		}
	}
}

// Inject OG meta tags for transaction pages (for social media crawlers)
class OgMetaInjector {
	private ogImageUrl: string
	private title: string

	constructor(ogImageUrl: string, title: string) {
		this.ogImageUrl = ogImageUrl
		this.title = title
	}

	element(element: Element) {
		// Prepend OG meta tags at the start of <head> (after charset/viewport)
		element.prepend(
			`<meta name="twitter:image" content="${this.ogImageUrl}" />`,
			{ html: true },
		)
		element.prepend(
			'<meta name="twitter:card" content="summary_large_image" />',
			{
				html: true,
			},
		)
		element.prepend('<meta property="og:image:height" content="630" />', {
			html: true,
		})
		element.prepend('<meta property="og:image:width" content="1200" />', {
			html: true,
		})
		element.prepend('<meta property="og:image:type" content="image/png" />', {
			html: true,
		})
		element.prepend(
			`<meta property="og:image" content="${this.ogImageUrl}" />`,
			{ html: true },
		)
		element.prepend(`<meta property="og:title" content="${this.title}" />`, {
			html: true,
		})
	}
}

interface TxData {
	blockNumber: string
	from: string
	timestamp: number
	fee: string
	total: string
	events: KnownEvent[]
}

async function fetchTxData(hash: string): Promise<TxData | null> {
	try {
		// Fetch transaction and receipt in parallel
		const [txRes, receiptRes] = await Promise.all([
			fetch(RPC_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getTransactionByHash',
					params: [hash],
					id: 1,
				}),
			}),
			fetch(RPC_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getTransactionReceipt',
					params: [hash],
					id: 2,
				}),
			}),
		])

		const [txJson, receiptJson] = await Promise.all([
			txRes.json() as Promise<{
				result?: {
					blockNumber?: string
					from?: string
					gasPrice?: string
					to?: string
					input?: string
				}
			}>,
			receiptRes.json() as Promise<{
				result?: TransactionReceipt
			}>,
		])

		const blockNumber = txJson.result?.blockNumber
		const receipt = receiptJson.result
		const from = (receipt?.from as string) || txJson.result?.from

		if (!blockNumber || !from || !receipt) return null

		// Calculate fee from gasUsed * effectiveGasPrice
		const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed) : 0n
		const gasPrice = receipt.effectiveGasPrice
			? BigInt(receipt.effectiveGasPrice)
			: txJson.result?.gasPrice
				? BigInt(txJson.result.gasPrice)
				: 0n
		const feeWei = gasUsed * gasPrice
		// Convert to USD (assuming 18 decimals and ~1 USD per token for simplicity)
		const feeUsd = Number(feeWei) / 1e18

		// Fetch block for timestamp
		const blockRes = await fetch(RPC_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_getBlockByNumber',
				params: [blockNumber, false],
				id: 3,
			}),
		})
		const blockJson = (await blockRes.json()) as {
			result?: { timestamp?: string }
		}
		const timestamp = blockJson.result?.timestamp
			? Number.parseInt(blockJson.result.timestamp, 16) * 1000
			: Date.now()

		// Format fee string
		const feeStr =
			feeUsd < 0.01 ? '<$0.01' : `$${feeUsd.toFixed(feeUsd < 1 ? 3 : 2)}`

		// Parse known events from receipt
		let events: KnownEvent[] = []
		try {
			const transaction = txJson.result
				? {
						to: txJson.result.to as Address.Address | undefined,
						input: txJson.result.input as `0x${string}` | undefined,
					}
				: undefined
			events = parseKnownEvents(receipt, { transaction })
				.filter(preferredEventsFilter)
				.slice(0, 6) // Limit to 6 events for OG image
		} catch {
			// Ignore event parsing errors
		}

		return {
			blockNumber: Number.parseInt(blockNumber, 16).toString(),
			from,
			timestamp,
			fee: feeStr,
			total: feeStr,
			events,
		}
	} catch {
		return null
	}
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	})
}

function truncateAddress(address: string): string {
	if (address.length <= 13) return address
	return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatAmount(amount: {
	value: bigint
	decimals?: number
	symbol?: string
}): string {
	const decimals = amount.decimals ?? 18
	const value = Number(amount.value) / 10 ** decimals
	const formatted = value < 0.01 ? '<0.01' : value.toFixed(2)
	return amount.symbol ? `${formatted} ${amount.symbol}` : formatted
}

function formatEventPart(part: KnownEventPart): string {
	switch (part.type) {
		case 'action':
			return part.value
		case 'text':
			return part.value
		case 'account':
			return truncateAddress(part.value)
		case 'amount':
			return formatAmount(part.value)
		case 'token':
			return part.value.symbol || truncateAddress(part.value.address)
		case 'number': {
			if (Array.isArray(part.value)) {
				const [val, dec] = part.value
				return (Number(val) / 10 ** dec).toFixed(2)
			}
			return part.value.toString()
		}
		case 'hex':
			return truncateAddress(part.value)
		default:
			return ''
	}
}

function formatEventForOg(event: KnownEvent): string {
	// Format: "Action|Details|Amount"
	// Find action part
	const actionPart = event.parts.find((p) => p.type === 'action')
	const action = actionPart ? formatEventPart(actionPart) : event.type

	// Build details from non-action, non-amount parts
	const detailParts = event.parts.filter(
		(p) => p.type !== 'action' && p.type !== 'amount',
	)
	const details = detailParts.map(formatEventPart).join(' ')

	// Find amount
	const amountPart = event.parts.find((p) => p.type === 'amount')
	const amount = amountPart ? formatEventPart(amountPart) : ''

	return `${action}|${details}|${amount}`
}

async function buildTxOgUrl(hash: string): Promise<string> {
	const txData = await fetchTxData(hash)

	const params = new URLSearchParams()
	if (txData) {
		params.set('block', txData.blockNumber)
		params.set('sender', txData.from)
		params.set('date', formatDate(txData.timestamp))
		params.set('time', formatTime(txData.timestamp))
		params.set('fee', txData.fee)
		params.set('total', txData.total)

		// Add events as e1, e2, e3, etc.
		txData.events.forEach((event, index) => {
			if (index < 6) {
				params.set(`e${index + 1}`, formatEventForOg(event))
			}
		})
	}

	return `${OG_BASE_URL}/tx/${hash}?${params.toString()}`
}

// ============ Token OG Image ============

interface TokenData {
	name: string
	symbol: string
	currency: string
	holders: number
	supply: string
	created: string
	quoteToken?: string
}

async function fetchTokenData(address: string): Promise<TokenData | null> {
	try {
		// Fetch token metadata via RPC call to the token contract
		// For now, use a simple approach - call name(), symbol(), decimals(), totalSupply()
		const calls = [
			// name()
			{
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [
					{ to: address, data: '0x06fdde03' }, // name()
					'latest',
				],
				id: 1,
			},
			// symbol()
			{
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [
					{ to: address, data: '0x95d89b41' }, // symbol()
					'latest',
				],
				id: 2,
			},
			// decimals()
			{
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [
					{ to: address, data: '0x313ce567' }, // decimals()
					'latest',
				],
				id: 3,
			},
			// totalSupply()
			{
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [
					{ to: address, data: '0x18160ddd' }, // totalSupply()
					'latest',
				],
				id: 4,
			},
		]

		const responses = await Promise.all(
			calls.map((call) =>
				fetch(RPC_URL, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(call),
				}).then((r) => r.json() as Promise<{ result?: string }>),
			),
		)

		const [nameRes, symbolRes, decimalsRes, supplyRes] = responses

		// Decode string results (remove 0x prefix and decode ABI-encoded string)
		const decodeName = (hex: string | undefined): string => {
			if (!hex || hex === '0x') return '—'
			try {
				// ABI-encoded string: skip first 64 chars (offset) + 64 chars (length), then decode
				const data = hex.slice(2)
				if (data.length < 128) return '—'
				const length = Number.parseInt(data.slice(64, 128), 16)
				const strHex = data.slice(128, 128 + length * 2)
				return Buffer.from(strHex, 'hex').toString('utf8').replace(/\0/g, '')
			} catch {
				return '—'
			}
		}

		const name = decodeName(nameRes.result)
		const symbol = decodeName(symbolRes.result)

		const decimals = decimalsRes.result
			? Number.parseInt(decimalsRes.result, 16)
			: 18

		const totalSupplyRaw = supplyRes.result
			? BigInt(supplyRes.result)
			: 0n
		const totalSupply = Number(totalSupplyRaw) / 10 ** decimals

		// Format supply with commas
		const formatSupply = (n: number): string => {
			if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
			if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
			if (n >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
			return n.toFixed(2)
		}

		return {
			name: name || '—',
			symbol: symbol || '—',
			currency: 'USD', // Default for now
			holders: 0, // Would need indexer query
			supply: formatSupply(totalSupply),
			created: '—', // Would need indexer query
		}
	} catch {
		return null
	}
}

async function buildTokenOgUrl(address: string): Promise<string> {
	const tokenData = await fetchTokenData(address)

	const params = new URLSearchParams()
	if (tokenData) {
		params.set('name', tokenData.name)
		params.set('symbol', tokenData.symbol)
		params.set('currency', tokenData.currency)
		params.set('holders', tokenData.holders.toString())
		params.set('supply', tokenData.supply)
		params.set('created', tokenData.created)
		if (tokenData.quoteToken) {
			params.set('quoteToken', tokenData.quoteToken)
		}
	}

	return `${OG_BASE_URL}/token/${address}?${params.toString()}`
}

export default Sentry.withSentry(
	(env: Cloudflare.Env) => {
		const metadata = env.CF_VERSION_METADATA
		return {
			dsn: 'https://170113585c24ca7a67704f86cccd6750@o4510262603481088.ingest.us.sentry.io/4510467689218048',
			release: metadata.id,
			// Adds request headers and IP for users, for more info visit:
			// https://docs.sentry.io/platforms/javascript/guides/cloudflare/configuration/options/#sendDefaultPii
			sendDefaultPii: true,
			enableLogs: true,
		}
	},
	{
		fetch: async (request: Request, opts) => {
			const url = new URL(request.url)
			if (url.pathname === '/debug-sentry')
				throw new Error('My first Sentry error!')

			// Get the response from the app
			const response = await handler.fetch(
				request,
				opts as Parameters<ServerEntry['fetch']>[1],
			)

			// Check if this is a transaction or receipt page and inject OG meta tags
			const txMatch = url.pathname.match(/^\/(tx|receipt)\/0x[a-fA-F0-9]{64}$/)
			if (
				txMatch &&
				response.headers.get('content-type')?.includes('text/html')
			) {
				const pathParts = url.pathname.split('/')
				const hash = pathParts[2] // Gets the hash from /tx/{hash} or /receipt/{hash}
				const ogImageUrl = await buildTxOgUrl(hash)
				const title = `Transaction ${hash.slice(0, 10)}...${hash.slice(-6)} ⋅ Tempo Explorer`

				// Use HTMLRewriter to remove existing OG tags and inject transaction-specific ones
				return new HTMLRewriter()
					.on('meta', new OgMetaRemover())
					.on('head', new OgMetaInjector(ogImageUrl, title))
					.transform(response)
			}

			// Check if this is a token page and inject OG meta tags
			const tokenMatch = url.pathname.match(/^\/token\/0x[a-fA-F0-9]{40}$/)
			if (
				tokenMatch &&
				response.headers.get('content-type')?.includes('text/html')
			) {
				const address = url.pathname.split('/token/')[1]
				const ogImageUrl = await buildTokenOgUrl(address)
				const title = `Token ${address.slice(0, 10)}...${address.slice(-6)} ⋅ Tempo Explorer`

				// Use HTMLRewriter to remove existing OG tags and inject token-specific ones
				return new HTMLRewriter()
					.on('meta', new OgMetaRemover())
					.on('head', new OgMetaInjector(ogImageUrl, title))
					.transform(response)
			}

			return response
		},
	},
)
