import * as Sentry from '@sentry/cloudflare'
import handler, { type ServerEntry } from '@tanstack/react-start/server-entry'
import * as IDX from 'idxs'
import type { Address } from 'ox'
import { Actions } from 'tempo.ts/wagmi'
import type { Log, TransactionReceipt } from 'viem'
import { zeroAddress } from 'viem'
import {
	type KnownEvent,
	type KnownEventPart,
	parseKnownEvents,
	preferredEventsFilter,
} from '#lib/domain/known-events'
import * as Tip20 from '#lib/domain/tip20'
import { config } from '#wagmi.config'

const OG_BASE_URL = 'https://og.porto.workers.dev'
const RPC_URL = 'https://rpc-orchestra.testnet.tempo.xyz'
const CHAIN_ID = 42429 // Testnet chain ID

// Indexer setup for token holder queries
const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})
const QB = IDX.QueryBuilder.from(IS)
const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

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
	private description: string

	constructor(ogImageUrl: string, title: string, description: string) {
		this.ogImageUrl = ogImageUrl
		this.title = title
		this.description = description
	}

	element(element: Element) {
		// Prepend OG meta tags at the start of <head> (after charset/viewport)
		element.prepend(
			`<meta name="twitter:image" content="${this.ogImageUrl}" />`,
			{ html: true },
		)
		element.prepend(
			'<meta name="twitter:card" content="summary_large_image" />',
			{ html: true },
		)
		element.prepend(
			`<meta name="twitter:description" content="${this.description}" />`,
			{ html: true },
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
		element.prepend(
			`<meta property="og:description" content="${this.description}" />`,
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

		// Parse known events from receipt with token metadata
		let events: KnownEvent[] = []
		try {
			const transaction = txJson.result
				? {
						to: txJson.result.to as Address.Address | undefined,
						input: txJson.result.input as `0x${string}` | undefined,
					}
				: undefined

			// Get token metadata from logs to resolve symbols
			const getTokenMetadata = await Tip20.metadataFromLogs(
				receipt.logs as Log[],
			)

			events = parseKnownEvents(receipt, { transaction, getTokenMetadata })
				.filter(preferredEventsFilter)
				.slice(0, 6) // Limit to 6 events for OG image

			// Backfill missing symbols for amount parts
			const tokensMissingSymbols = new Set<Address.Address>()
			for (const event of events) {
				for (const part of event.parts) {
					if (
						part.type === 'amount' &&
						!part.value.symbol &&
						part.value.token
					) {
						tokensMissingSymbols.add(part.value.token)
					}
				}
			}

			if (tokensMissingSymbols.size > 0) {
				const missingMetadata = await Promise.all(
					Array.from(tokensMissingSymbols).map(async (token) => {
						try {
							const metadata = await Actions.token.getMetadata(config, {
								token,
							})
							return { token, metadata }
						} catch {
							return { token, metadata: null }
						}
					}),
				)

				const metadataMap = new Map(
					missingMetadata
						.filter((m) => m.metadata)
						.map((m) => [m.token, m.metadata]),
				)

				// Update events with missing symbols
				for (const event of events) {
					for (const part of event.parts) {
						if (
							part.type === 'amount' &&
							!part.value.symbol &&
							part.value.token
						) {
							const metadata = metadataMap.get(part.value.token)
							if (metadata) {
								part.value.symbol = metadata.symbol
								part.value.decimals = metadata.decimals
							}
						}
					}
				}
			}
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
	const d = new Date(timestamp)
	const month = d.toLocaleDateString('en-US', { month: 'short' })
	const day = d.getDate()
	const year = d.getFullYear()
	return `${month} ${day} ${year}`
}

function formatTime(timestamp: number): string {
	const d = new Date(timestamp)
	const hours = String(d.getHours()).padStart(2, '0')
	const minutes = String(d.getMinutes()).padStart(2, '0')
	return `${hours}:${minutes}`
}

// Generate contextual OG description for transactions
function buildTxDescription(txData: TxData | null, _hash: string): string {
	if (!txData) {
		return `View transaction details on Tempo Explorer.`
	}

	const date = formatDate(txData.timestamp)
	const eventCount = txData.events.length

	// Try to summarize the main action
	if (eventCount > 0) {
		const firstEvent = txData.events[0]
		const actionPart = firstEvent.parts.find((p) => p.type === 'action')
		const action = actionPart
			? String(actionPart.value).toLowerCase()
			: 'transaction'

		if (eventCount === 1) {
			return `A ${action} on ${date} from ${truncateAddress(txData.from)}. View full details on Tempo Explorer.`
		}
		return `A ${action} and ${eventCount - 1} other action${eventCount > 2 ? 's' : ''} on ${date}. View full details on Tempo Explorer.`
	}

	return `Transaction on ${date} from ${truncateAddress(txData.from)}. View details on Tempo Explorer.`
}

// Generate contextual OG description for tokens
// Format: "testUSD (tUSD) · 1.00M total supply"
function buildTokenDescription(
	tokenData: TokenData | null,
	_address: string,
): string {
	if (!tokenData || tokenData.name === '—') {
		return `View token details and activity on Tempo Explorer.`
	}

	// Build: "testUSD (tUSD) · 1.00M total supply"
	const namePart =
		tokenData.symbol && tokenData.symbol !== '—'
			? `${tokenData.name} (${tokenData.symbol})`
			: tokenData.name

	if (tokenData.supply && tokenData.supply !== '—') {
		return `${namePart} · ${tokenData.supply} total supply. View token activity on Tempo Explorer.`
	}

	return `${namePart}. View token activity on Tempo Explorer.`
}

function truncateAddress(address: string): string {
	if (address.length <= 13) return address
	return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatAmount(
	amount: {
		value: bigint
		decimals?: number
		symbol?: string
	},
	includeSymbol = true,
): string {
	const decimals = amount.decimals ?? 18
	const value = Number(amount.value) / 10 ** decimals
	// Always show 2 decimal places for consistency
	let formatted: string
	if (value === 0) {
		formatted = '0.00'
	} else if (value < 0.01) {
		formatted = '<0.01'
	} else if (value >= 1000000000) {
		formatted = `${(value / 1000000000).toFixed(2)}B`
	} else if (value >= 1000000) {
		formatted = `${(value / 1000000).toFixed(2)}M`
	} else if (value >= 1000) {
		formatted = `${(value / 1000).toFixed(2)}K`
	} else {
		formatted = value.toFixed(2)
	}
	return includeSymbol && amount.symbol
		? `${formatted} ${amount.symbol}`
		: formatted
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
				const num = Number(val) / 10 ** dec
				// Show more precision for small numbers
				if (num < 1) {
					return num.toFixed(4).replace(/\.?0+$/, '')
				}
				return num.toFixed(2)
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
	// OG expects: "Swap|10 pathUSD for 10 AlphaUSD|$10"
	//            "Approve|10 pathUSD for spender 0x1234...5678|$10"

	// Find action part
	const actionPart = event.parts.find((p) => p.type === 'action')
	const action = actionPart ? formatEventPart(actionPart) : event.type

	// Build details from ALL non-action parts (including amounts and tokens)
	// This gives us "10 pathUSD for 10 AlphaUSD" for swaps
	const detailParts = event.parts.filter((p) => p.type !== 'action')
	const details = detailParts.map(formatEventPart).filter(Boolean).join(' ')

	// Calculate USD value for display (last column) - just the number, no token name
	// Use the first amount we find as a rough estimate
	let usdAmount = ''
	for (const part of event.parts) {
		if (part.type === 'amount') {
			const formatted = formatAmount(part.value, false) // No symbol for right column
			// Format as USD - if it's already formatted like "<0.01", prefix with $
			usdAmount = formatted.startsWith('<')
				? `<$${formatted.slice(1)}`
				: `$${formatted}`
			break
		}
	}

	return `${action}|${details}|${usdAmount}`
}

async function buildTxOgData(hash: string): Promise<{
	url: string
	description: string
}> {
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

	return {
		url: `${OG_BASE_URL}/tx/${hash}?${params.toString()}`,
		description: buildTxDescription(txData, hash),
	}
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

// Fetch holder count and first transfer date from indexer
async function fetchTokenIndexerData(
	address: string,
): Promise<{ holders: number; created: string }> {
	try {
		const qb = QB.withSignatures([TRANSFER_SIGNATURE])
		const tokenAddress = address.toLowerCase() as Address.Address

		// Get unique holder count by aggregating incoming transfers
		const incoming = await qb
			.selectFrom('transfer')
			.select((eb) => [
				eb.ref('to').as('holder'),
				eb.fn.sum('tokens').as('received'),
			])
			.where('chain', '=', CHAIN_ID)
			.where('address', '=', tokenAddress)
			.groupBy('to')
			.execute()

		const outgoing = await qb
			.selectFrom('transfer')
			.select((eb) => [
				eb.ref('from').as('holder'),
				eb.fn.sum('tokens').as('sent'),
			])
			.where('chain', '=', CHAIN_ID)
			.where('address', '=', tokenAddress)
			.where('from', '<>', zeroAddress)
			.groupBy('from')
			.execute()

		// Calculate balances to count holders with balance > 0
		const balances = new Map<string, bigint>()
		for (const row of incoming) {
			const received = BigInt(row.received)
			balances.set(row.holder, (balances.get(row.holder) ?? 0n) + received)
		}
		for (const row of outgoing) {
			const sent = BigInt(row.sent)
			balances.set(row.holder, (balances.get(row.holder) ?? 0n) - sent)
		}
		const holders = Array.from(balances.values()).filter((b) => b > 0n).length

		// Get first transfer (token creation)
		const firstTransfer = await qb
			.selectFrom('transfer')
			.select(['block_timestamp'])
			.where('chain', '=', CHAIN_ID)
			.where('address', '=', tokenAddress)
			.orderBy('block_num', 'asc')
			.limit(1)
			.executeTakeFirst()

		let created = '—'
		if (firstTransfer?.block_timestamp) {
			const date = new Date(Number(firstTransfer.block_timestamp) * 1000)
			created = date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			})
		}

		return { holders, created }
	} catch (e) {
		console.error('Failed to fetch token indexer data:', e)
		return { holders: 0, created: '—' }
	}
}

async function fetchTokenData(address: string): Promise<TokenData | null> {
	try {
		// Fetch token metadata via RPC and indexer data in parallel
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

		// Fetch RPC data and indexer data in parallel
		const [responses, indexerData] = await Promise.all([
			Promise.all(
				calls.map((call) =>
					fetch(RPC_URL, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(call),
					}).then((r) => r.json() as Promise<{ result?: string }>),
				),
			),
			fetchTokenIndexerData(address),
		])

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

		const totalSupplyRaw = supplyRes.result ? BigInt(supplyRes.result) : 0n
		const totalSupply = Number(totalSupplyRaw) / 10 ** decimals

		// Format supply with commas
		const formatSupply = (n: number): string => {
			if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
			if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
			if (n >= 1e3)
				return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
			return n.toFixed(2)
		}

		return {
			name: name || '—',
			symbol: symbol || '—',
			currency: 'USD',
			holders: indexerData.holders,
			supply: formatSupply(totalSupply),
			created: indexerData.created,
		}
	} catch {
		return null
	}
}

// Check if a token has Fee AMM liquidity (required to be a functional fee token)
async function hasFeeAmmLiquidity(tokenAddress: string): Promise<boolean> {
	try {
		const FEE_MANAGER = '0xfeec000000000000000000000000000000000000'
		const PATH_USD = '0x20c0000000000000000000000000000000000000'
		const ALPHA_USD = '0x20c0000000000000000000000000000000000001'

		// getPool(address,address) selector = 0x531aa03e
		// Check liquidity: pair token with pathUSD, unless token IS pathUSD
		const paddedToken = tokenAddress.slice(2).toLowerCase().padStart(64, '0')
		// If token is pathUSD, check against AlphaUSD instead
		const pairToken =
			tokenAddress.toLowerCase() === PATH_USD.toLowerCase()
				? ALPHA_USD
				: PATH_USD
		const paddedPair = pairToken.slice(2).padStart(64, '0')

		const res = await fetch(RPC_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [
					{ to: FEE_MANAGER, data: `0x531aa03e${paddedToken}${paddedPair}` },
					'latest',
				],
				id: 1,
			}),
		})
		const json = (await res.json()) as { result?: string }

		if (json.result && json.result !== '0x' && json.result.length >= 130) {
			// Pool struct: (uint128 reserveUserToken, uint128 reserveValidatorToken)
			const reserveUser = BigInt('0x' + json.result.slice(2, 66))
			const reserveValidator = BigInt('0x' + json.result.slice(66, 130))
			return reserveUser > 0n || reserveValidator > 0n
		}
		return false
	} catch {
		return false
	}
}

async function buildTokenOgData(address: string): Promise<{
	url: string
	description: string
}> {
	const tokenData = await fetchTokenData(address)

	// Fee tokens are USD-denominated TIP-20 tokens WITH Fee AMM liquidity
	// 1. Must be TIP-20 (0x20c prefix)
	// 2. Must have currency = USD
	// 3. Must have liquidity in Fee AMM pools
	const isTIP20 = address.toLowerCase().startsWith('0x20c')
	let isFeeToken = false
	if (isTIP20 && tokenData?.currency === 'USD') {
		isFeeToken = await hasFeeAmmLiquidity(address)
	}

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
		if (isFeeToken) {
			params.set('isFeeToken', 'true')
		}
	}

	return {
		url: `${OG_BASE_URL}/token/${address}?${params.toString()}`,
		description: buildTokenDescription(tokenData, address),
	}
}

// ============ Address OG Image ============

interface AddressData {
	holdings: string
	txCount: number
	lastActive: string
	created: string
	feeToken: string
	tokensHeld: string[]
	isContract: boolean
	methods: string[] // Contract methods detected
}

async function fetchAddressData(address: string): Promise<AddressData | null> {
	try {
		const tokenAddress = address.toLowerCase() as Address.Address
		const qb = QB.withSignatures([TRANSFER_SIGNATURE])

		// Check if address is a contract
		// - EOAs have no code
		// - EIP-7702 smart wallets have code starting with 0xef0100 (delegation prefix)
		// - Traditional contracts have other bytecode
		let isContract = false
		try {
			const codeRes = await fetch(RPC_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getCode',
					params: [address, 'latest'],
					id: 1,
				}),
			})
			const codeJson = (await codeRes.json()) as { result?: string }
			const code = codeJson.result || '0x'

			// No code = EOA, not a contract
			if (code === '0x') {
				isContract = false
			}
			// EIP-7702 delegation prefix (0xef0100) = smart wallet, not a contract
			else if (code.toLowerCase().startsWith('0xef0100')) {
				isContract = false
			}
			// Has other bytecode = traditional contract
			else {
				isContract = true
			}
		} catch {
			// Ignore errors, assume not a contract
		}

		// Detect contract type and set method names
		let detectedMethods: string[] = []
		let contractType = '' // For description
		if (isContract) {
			const addrLower = address.toLowerCase()

			// Check known system contracts first
			if (addrLower === '0x20fc000000000000000000000000000000000000') {
				// TIP-20 Factory
				contractType = 'TIP-20 Factory'
				detectedMethods = ['createToken', 'isTIP20', 'tokenIdCounter']
			} else if (addrLower === '0xfeec000000000000000000000000000000000000') {
				// Fee Manager
				contractType = 'Fee Manager'
				detectedMethods = [
					'getPool',
					'setUserToken',
					'setValidatorToken',
					'rebalanceSwap',
				]
			} else if (addrLower === '0xdec0000000000000000000000000000000000000') {
				// Stablecoin DEX
				contractType = 'Stablecoin DEX'
				detectedMethods = [
					'swap',
					'getQuote',
					'addLiquidity',
					'removeLiquidity',
				]
			} else if (addrLower === '0x403c000000000000000000000000000000000000') {
				// TIP-403 Registry
				contractType = 'TIP-403 Registry'
				detectedMethods = ['isAuthorized', 'getPolicyOwner', 'createPolicy']
			} else if (addrLower.startsWith('0x20c')) {
				// TIP-20 Token
				contractType = 'TIP-20 Token'
				detectedMethods = [
					'transfer',
					'approve',
					'balanceOf',
					'allowance',
					'totalSupply',
					'decimals',
					'symbol',
					'name',
				]
			} else {
				// Unknown contract - try to detect if it's a token
				try {
					const res = await fetch(RPC_URL, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_call',
							params: [{ to: address, data: '0x95d89b41' }, 'latest'], // symbol()
							id: 1,
						}),
					})
					const json = (await res.json()) as {
						result?: string
						error?: unknown
					}
					if (json.result && json.result !== '0x' && !json.error) {
						contractType = 'Token'
						detectedMethods = [
							'transfer',
							'approve',
							'balanceOf',
							'allowance',
							'totalSupply',
							'decimals',
							'symbol',
							'name',
						]
					}
				} catch {
					// Unknown contract type
				}
			}
		}

		// Get all transfers involving this address
		const [incoming, outgoing] = await Promise.all([
			qb
				.selectFrom('transfer')
				.select(['tokens', 'address', 'block_timestamp'])
				.where('chain', '=', CHAIN_ID)
				.where('to', '=', tokenAddress)
				.orderBy('block_timestamp', 'desc')
				.execute(),
			qb
				.selectFrom('transfer')
				.select(['tokens', 'address', 'block_timestamp'])
				.where('chain', '=', CHAIN_ID)
				.where('from', '=', tokenAddress)
				.orderBy('block_timestamp', 'desc')
				.execute(),
		])

		// Calculate balances per token
		const balances = new Map<string, bigint>()
		for (const row of incoming) {
			const current = balances.get(row.address) ?? 0n
			balances.set(row.address, current + BigInt(row.tokens))
		}
		for (const row of outgoing) {
			const current = balances.get(row.address) ?? 0n
			balances.set(row.address, current - BigInt(row.tokens))
		}

		// Get tokens with positive balance
		const tokensWithBalance = Array.from(balances.entries())
			.filter(([, balance]) => balance > 0n)
			.map(([addr]) => addr)

		// Get token symbols for held tokens
		const tokensHeld: string[] = []
		for (const tokenAddr of tokensWithBalance.slice(0, 12)) {
			try {
				const symbolRes = await fetch(RPC_URL, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_call',
						params: [{ to: tokenAddr, data: '0x95d89b41' }, 'latest'],
						id: 1,
					}),
				})
				const json = (await symbolRes.json()) as { result?: string }
				if (json.result && json.result !== '0x') {
					const data = json.result.slice(2)
					if (data.length >= 128) {
						const length = Number.parseInt(data.slice(64, 128), 16)
						const strHex = data.slice(128, 128 + length * 2)
						const symbol = Buffer.from(strHex, 'hex')
							.toString('utf8')
							.replace(/\0/g, '')
						if (symbol) tokensHeld.push(symbol)
					}
				}
			} catch {
				// Skip tokens we can't decode
			}
		}

		// Total transaction count - query from txs table like frontend does
		let txCount = 0
		try {
			const [txSent, txReceived] = await Promise.all([
				qb
					.selectFrom('txs')
					.select((eb) => eb.fn.count('hash').as('cnt'))
					.where('from', '=', tokenAddress)
					.where('chain', '=', CHAIN_ID)
					.executeTakeFirst(),
				qb
					.selectFrom('txs')
					.select((eb) => eb.fn.count('hash').as('cnt'))
					.where('to', '=', tokenAddress)
					.where('chain', '=', CHAIN_ID)
					.executeTakeFirst(),
			])
			txCount = Number(txSent?.cnt ?? 0) + Number(txReceived?.cnt ?? 0)
		} catch {
			// Fallback to transfer count if txs query fails
			txCount = incoming.length + outgoing.length
		}

		// Get timestamps
		const allTransfers = [...incoming, ...outgoing].sort(
			(a, b) => Number(b.block_timestamp) - Number(a.block_timestamp),
		)
		const lastActive =
			allTransfers.length > 0
				? formatDateTime(Number(allTransfers[0].block_timestamp) * 1000)
				: '—'

		const oldestTransfers = [...incoming, ...outgoing].sort(
			(a, b) => Number(a.block_timestamp) - Number(b.block_timestamp),
		)
		const created =
			oldestTransfers.length > 0
				? formatDateTime(Number(oldestTransfers[0].block_timestamp) * 1000)
				: '—'

		// Calculate holdings using same tokens as frontend
		// Frontend uses these 4 specific token addresses
		const KNOWN_TOKENS = [
			'0x20c0000000000000000000000000000000000000',
			'0x20c0000000000000000000000000000000000001',
			'0x20c0000000000000000000000000000000000002',
			'0x20c0000000000000000000000000000000000003',
		]

		let totalValue = 0
		const PRICE_PER_TOKEN = 1
		const knownTokensHeld: string[] = []

		// Fetch balanceOf, decimals, and symbol for each known token
		for (const tokenAddr of KNOWN_TOKENS) {
			try {
				// balanceOf(address) - 0x70a08231 + padded address
				const balanceOfData = `0x70a08231000000000000000000000000${address.slice(2).toLowerCase()}`

				const [balanceRes, decimalsRes, symbolRes] = await Promise.all([
					fetch(RPC_URL, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_call',
							params: [{ to: tokenAddr, data: balanceOfData }, 'latest'],
							id: 1,
						}),
					}),
					fetch(RPC_URL, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_call',
							params: [{ to: tokenAddr, data: '0x313ce567' }, 'latest'], // decimals()
							id: 2,
						}),
					}),
					fetch(RPC_URL, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_call',
							params: [{ to: tokenAddr, data: '0x95d89b41' }, 'latest'], // symbol()
							id: 3,
						}),
					}),
				])

				const balanceJson = (await balanceRes.json()) as { result?: string }
				const decimalsJson = (await decimalsRes.json()) as { result?: string }
				const symbolJson = (await symbolRes.json()) as { result?: string }

				const balance =
					balanceJson.result && balanceJson.result !== '0x'
						? BigInt(balanceJson.result)
						: 0n
				const decimals =
					decimalsJson.result && decimalsJson.result !== '0x'
						? Number.parseInt(decimalsJson.result, 16)
						: 18

				if (balance > 0n) {
					// Same calculation as frontend: Number(formatUnits(balance, decimals)) * PRICE_PER_TOKEN
					totalValue += (Number(balance) / 10 ** decimals) * PRICE_PER_TOKEN

					// Also get symbol for tokensHeld
					if (symbolJson.result && symbolJson.result !== '0x') {
						const data = symbolJson.result.slice(2)
						if (data.length >= 128) {
							const length = Number.parseInt(data.slice(64, 128), 16)
							const strHex = data.slice(128, 128 + length * 2)
							const symbol = Buffer.from(strHex, 'hex')
								.toString('utf8')
								.replace(/\0/g, '')
							if (symbol && !knownTokensHeld.includes(symbol)) {
								knownTokensHeld.push(symbol)
							}
						}
					}
				}
			} catch {
				// Skip tokens we can't fetch
			}
		}

		// Combine tokensHeld from indexer with known tokens, limit to 8 (2 rows worth)
		const allTokensHeld = [
			...new Set([...knownTokensHeld, ...tokensHeld]),
		].slice(0, 8)

		// Format holdings with K/M/B suffixes
		const formatCompactValue = (n: number): string => {
			if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
			if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
			if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
			return `$${n.toFixed(2)}`
		}

		const holdings = totalValue > 0 ? formatCompactValue(totalValue) : '—'

		return {
			holdings,
			txCount,
			lastActive,
			created,
			feeToken: allTokensHeld[0] || '—',
			tokensHeld: allTokensHeld,
			isContract,
			methods: detectedMethods,
		}
	} catch (e) {
		console.error('Failed to fetch address data:', e)
		return null
	}
}

function formatDateTime(timestamp: number): string {
	const date = new Date(timestamp)
	return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
}

function buildAddressDescription(
	addressData: AddressData | null,
	_address: string,
): string {
	if (!addressData) {
		return `View address activity & holdings on Tempo Explorer.`
	}

	const parts: string[] = []
	if (addressData.holdings !== '—') {
		parts.push(`${addressData.holdings} in holdings`)
	}
	if (addressData.txCount > 0) {
		parts.push(`${addressData.txCount} transactions`)
	}

	if (parts.length > 0) {
		return `${parts.join(' · ')}. View full activity on Tempo Explorer.`
	}

	return `View address activity & holdings on Tempo Explorer.`
}

async function buildAddressOgData(address: string): Promise<{
	url: string
	description: string
	isContract: boolean
}> {
	const addressData = await fetchAddressData(address)

	const params = new URLSearchParams()
	if (addressData) {
		params.set('holdings', addressData.holdings)
		params.set('txCount', addressData.txCount.toString())
		params.set('lastActive', addressData.lastActive)
		params.set('created', addressData.created)
		params.set('feeToken', addressData.feeToken)
		if (addressData.tokensHeld.length > 0) {
			params.set('tokens', addressData.tokensHeld.join(','))
		}
		if (addressData.isContract) {
			params.set('isContract', 'true')
			if (addressData.methods.length > 0) {
				params.set('methods', addressData.methods.join(','))
			}
		}
	}

	return {
		url: `${OG_BASE_URL}/address/${address}?${params.toString()}`,
		description: buildAddressDescription(addressData, address),
		isContract: addressData?.isContract ?? false,
	}
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
				const ogData = await buildTxOgData(hash)
				const title = `Transaction ${hash.slice(0, 6)}...${hash.slice(-4)} ⋅ Tempo Explorer`

				// Use HTMLRewriter to remove existing OG tags and inject transaction-specific ones
				return new HTMLRewriter()
					.on('meta', new OgMetaRemover())
					.on('head', new OgMetaInjector(ogData.url, title, ogData.description))
					.transform(response)
			}

			// Check if this is a token page and inject OG meta tags
			// Handle both 200 responses and redirects (307) for token pages
			const tokenMatch = url.pathname.match(/^\/token\/0x[a-fA-F0-9]{40}$/)
			if (tokenMatch) {
				const address = url.pathname.split('/token/')[1]
				const ogData = await buildTokenOgData(address)
				const title = `Token ${address.slice(0, 6)}...${address.slice(-4)} ⋅ Tempo Explorer`

				// For redirects, return HTML with OG tags that will redirect client-side
				if (response.status >= 300 && response.status < 400) {
					const redirectUrl = response.headers.get('location') || '/'
					const html = `<!DOCTYPE html><html><head>
						<meta property="og:title" content="${title}" />
						<meta property="og:description" content="${ogData.description}" />
						<meta property="og:image" content="${ogData.url}" />
						<meta property="og:image:type" content="image/png" />
						<meta property="og:image:width" content="1200" />
						<meta property="og:image:height" content="630" />
						<meta name="twitter:card" content="summary_large_image" />
						<meta name="twitter:image" content="${ogData.url}" />
						<meta http-equiv="refresh" content="0;url=${redirectUrl}" />
					</head><body></body></html>`
					return new Response(html, {
						status: 200,
						headers: { 'Content-Type': 'text/html; charset=utf-8' },
					})
				}

				// For normal HTML responses, use HTMLRewriter
				if (response.headers.get('content-type')?.includes('text/html')) {
					return new HTMLRewriter()
						.on('meta', new OgMetaRemover())
						.on(
							'head',
							new OgMetaInjector(ogData.url, title, ogData.description),
						)
						.transform(response)
				}
			}

			// Check if this is an address page and inject OG meta tags
			const addressMatch = url.pathname.match(/^\/address\/0x[a-fA-F0-9]{40}$/)
			if (
				addressMatch &&
				response.headers.get('content-type')?.includes('text/html')
			) {
				const address = url.pathname.split('/address/')[1]
				const ogData = await buildAddressOgData(address)
				const label = ogData.isContract ? 'Contract' : 'Address'
				const title = `${label} ${address.slice(0, 6)}...${address.slice(-4)} ⋅ Tempo Explorer`

				// Use HTMLRewriter to remove existing OG tags and inject address-specific ones
				return new HTMLRewriter()
					.on('meta', new OgMetaRemover())
					.on('head', new OgMetaInjector(ogData.url, title, ogData.description))
					.transform(response)
			}

			return response
		},
	},
)
// deployed Fri Dec 12 05:12:04 PST 2025
