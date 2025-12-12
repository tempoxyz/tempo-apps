import * as Sentry from '@sentry/cloudflare'
import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'

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
		element.prepend('<meta name="twitter:card" content="summary_large_image" />', {
			html: true,
		})
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
				result?: { blockNumber?: string; from?: string }
			}>,
			receiptRes.json() as Promise<{ result?: { from?: string } }>,
		])

		const blockNumber = txJson.result?.blockNumber
		const from = receiptJson.result?.from || txJson.result?.from

		if (!blockNumber || !from) return null

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

		return {
			blockNumber: Number.parseInt(blockNumber, 16).toString(),
			from,
			timestamp,
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

async function buildOgUrl(hash: string): Promise<string> {
	const txData = await fetchTxData(hash)

	const params = new URLSearchParams()
	if (txData) {
		params.set('block', txData.blockNumber)
		params.set('sender', txData.from)
		params.set('date', formatDate(txData.timestamp))
		params.set('time', formatTime(txData.timestamp))
	}

	return `${OG_BASE_URL}/tx/${hash}?${params.toString()}`
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
				const ogImageUrl = await buildOgUrl(hash)
				const title = `Transaction ${hash.slice(0, 10)}...${hash.slice(-6)} ⋅ Tempo Explorer`

				// Use HTMLRewriter to remove existing OG tags and inject transaction-specific ones
				return new HTMLRewriter()
					.on('meta', new OgMetaRemover())
					.on('head', new OgMetaInjector(ogImageUrl, title))
					.transform(response)
			}

			return response
		},
	},
)
