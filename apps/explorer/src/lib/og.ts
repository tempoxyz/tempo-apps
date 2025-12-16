import * as IDX from 'idxs'
import type { Address } from 'ox'
import { Value } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { Actions } from 'tempo.ts/wagmi'
import { zeroAddress } from 'viem'
import {
	getBlock,
	getBytecode,
	getTransaction,
	getTransactionReceipt,
	readContract,
} from 'wagmi/actions'
import {
	type KnownEvent,
	type KnownEventPart,
	parseKnownEvents,
	preferredEventsFilter,
} from '#lib/domain/known-events'
import * as Tip20 from '#lib/domain/tip20'
import { DateFormatter, HexFormatter } from '#lib/formatting'
import {
	type AddressOgParams,
	buildAddressOgUrl,
	buildTokenOgUrl,
	buildTxOgUrl,
	type TokenOgParams,
	type TxOgEvent,
	type TxOgParams,
} from '#lib/og-params'
import type { TxData as TxDataQuery } from '#lib/queries'
import { config } from '#wagmi.config'

// ============ Constants ============

export const OG_BASE_URL = import.meta.env?.VITE_OG_URL
	? import.meta.env.VITE_OG_URL
	: 'https://og.porto.workers.dev'

function truncateOgText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text
	return `${text.slice(0, maxLength - 1)}…`
}

// ============ Client-side OG (for $hash.tsx) ============

export function buildOgImageUrl(data: TxDataQuery, hash: string): string {
	const timestamp = data.block.timestamp
	const ogTimestamp = DateFormatter.formatTimestampForOg(timestamp)

	let fee: string | undefined
	let total: string | undefined
	if (data.feeBreakdown.length > 0) {
		const totalFee = data.feeBreakdown.reduce((sum, item) => {
			const amount = Number.parseFloat(Value.format(item.amount, item.decimals))
			return sum + amount
		}, 0)
		const feeDisplay =
			totalFee > 0 && totalFee < 0.01 ? '<$0.01' : `$${totalFee.toFixed(2)}`
		fee = feeDisplay
		total = feeDisplay
	}

	const events: TxOgEvent[] = data.knownEvents.slice(0, 5).map((event) => {
		const actionPart = event.parts.find((p) => p.type === 'action')
		const action = actionPart?.type === 'action' ? actionPart.value : event.type

		const details = event.parts
			.filter((p) => p.type !== 'action')
			.map((part) => formatPartForOgClient(part))
			.filter(Boolean)
			.join(' ')

		const amountPart = event.parts.find((p) => p.type === 'amount')
		let amount = ''
		if (amountPart?.type === 'amount') {
			const val = Number(
				Value.format(amountPart.value.value, amountPart.value.decimals ?? 6),
			)
			amount = val > 0 && val < 0.01 ? '<$0.01' : `$${val.toFixed(0)}`
		}

		return { action, details, amount: amount || undefined }
	})

	const params: TxOgParams = {
		hash,
		block: String(data.block.number),
		sender: data.receipt.from,
		date: ogTimestamp.date,
		time: ogTimestamp.time,
		fee,
		total,
		events,
	}

	return buildTxOgUrl(OG_BASE_URL, params)
}

function formatPartForOgClient(part: KnownEventPart): string {
	switch (part.type) {
		case 'text':
			return part.value
		case 'amount':
			return `${Value.format(part.value.value, part.value.decimals ?? 6)} ${part.value.symbol || ''}`
		case 'account':
			return HexFormatter.truncate(part.value)
		case 'token':
			return part.value.symbol || HexFormatter.truncate(part.value.address)
		default:
			return ''
	}
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
	const value = Number.parseFloat(Value.format(amount.value, decimals))
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
			return HexFormatter.truncate(part.value)
		case 'amount':
			return formatAmount(part.value)
		case 'token':
			return part.value.symbol || HexFormatter.truncate(part.value.address)
		case 'number': {
			if (Array.isArray(part.value)) {
				const [val, dec] = part.value
				const num = Number.parseFloat(Value.format(val, dec))
				if (num < 1) {
					return num.toFixed(4).replace(/\.?0+$/, '')
				}
				return num.toFixed(2)
			}
			return part.value.toString()
		}
		case 'hex':
			return HexFormatter.truncate(part.value)
		default:
			return ''
	}
}

export function formatEventForOgServer(event: KnownEvent): string {
	const actionPart = event.parts.find((p) => p.type === 'action')
	const action = actionPart ? formatEventPart(actionPart) : event.type

	const detailParts = event.parts.filter((p) => p.type !== 'action')
	const details = detailParts.map(formatEventPart).filter(Boolean).join(' ')

	let usdAmount = ''
	for (const part of event.parts) {
		if (part.type === 'amount') {
			const formatted = formatAmount(part.value, false)
			usdAmount = formatted.startsWith('<')
				? `<$${formatted.slice(1)}`
				: `$${formatted}`
			break
		}
	}

	return `${truncateOgText(action, 20)}|${truncateOgText(details, 60)}|${truncateOgText(usdAmount, 15)}`
}

export function formatDate(timestamp: number): string {
	const d = new Date(timestamp)
	const month = d.toLocaleDateString('en-US', { month: 'short' })
	const day = d.getDate()
	const year = d.getFullYear()
	return `${month} ${day} ${year}`
}

export function formatTime(timestamp: number): string {
	const d = new Date(timestamp)
	const hours = String(d.getHours()).padStart(2, '0')
	const minutes = String(d.getMinutes()).padStart(2, '0')
	return `${hours}:${minutes}`
}

export function formatDateTime(timestamp: number): string {
	const date = new Date(timestamp)
	return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
}

export function buildTxDescription(
	txData: { timestamp: number; from: string; events: KnownEvent[] } | null,
): string {
	if (!txData) {
		return `View transaction details on Tempo Explorer.`
	}

	const date = formatDate(txData.timestamp)
	const eventCount = txData.events.length

	if (eventCount > 0) {
		const firstEvent = txData.events[0]
		const actionPart = firstEvent.parts.find((p) => p.type === 'action')
		const action = actionPart
			? truncateOgText(String(actionPart.value).toLowerCase(), 20)
			: 'transaction'

		if (eventCount === 1) {
			return truncateOgText(
				`A ${action} on ${date} from ${HexFormatter.truncate(txData.from as Address.Address)}. View full details on Tempo Explorer.`,
				160,
			)
		}
		return truncateOgText(
			`A ${action} and ${eventCount - 1} other action${eventCount > 2 ? 's' : ''} on ${date}. View full details on Tempo Explorer.`,
			160,
		)
	}

	return truncateOgText(
		`Transaction on ${date} from ${HexFormatter.truncate(txData.from as Address.Address)}. View details on Tempo Explorer.`,
		160,
	)
}

export function buildTokenDescription(
	tokenData: { name: string; symbol?: string; supply?: string } | null,
): string {
	if (!tokenData || tokenData.name === '—') {
		return `View token details and activity on Tempo Explorer.`
	}

	const name = truncateOgText(tokenData.name, 30)
	const symbol =
		tokenData.symbol && tokenData.symbol !== '—'
			? truncateOgText(tokenData.symbol, 12)
			: null

	const namePart = symbol ? `${name} (${symbol})` : name

	if (tokenData.supply && tokenData.supply !== '—') {
		return truncateOgText(
			`${namePart} · ${tokenData.supply} total supply. View token activity on Tempo Explorer.`,
			160,
		)
	}

	return truncateOgText(
		`${namePart}. View token activity on Tempo Explorer.`,
		160,
	)
}

export function buildAddressDescription(
	addressData: { holdings: string; txCount: number } | null,
	_address: string,
): string {
	if (!addressData) {
		return `View address activity & holdings on Tempo Explorer.`
	}

	const parts: string[] = []
	if (addressData.holdings !== '—') {
		parts.push(`${truncateOgText(addressData.holdings, 20)} in holdings`)
	}
	if (addressData.txCount > 0) {
		parts.push(`${addressData.txCount} transactions`)
	}

	if (parts.length > 0) {
		return truncateOgText(
			`${parts.join(' · ')}. View full activity on Tempo Explorer.`,
			160,
		)
	}

	return `View address activity & holdings on Tempo Explorer.`
}

export function buildTokenOgImageUrl(params: {
	address: string
	name?: string
	symbol?: string
	currency?: string
	holders?: number
	supply?: string
	created?: string
	isFeeToken?: boolean
}): string {
	const ogParams: TokenOgParams = {
		address: params.address,
		name: params.name,
		symbol: params.symbol,
		currency: params.currency,
		holders:
			typeof params.holders === 'number'
				? params.holders.toString()
				: undefined,
		supply: params.supply,
		created: params.created,
		isFeeToken: params.isFeeToken,
	}
	return buildTokenOgUrl(OG_BASE_URL, ogParams)
}

export function buildAddressOgImageUrl(params: {
	address: string
	holdings?: string
	txCount?: number
	lastActive?: string
	created?: string
	feeToken?: string
	tokens?: string[]
	isContract?: boolean
	methods?: string[]
}): string {
	const ogParams: AddressOgParams = {
		address: params.address,
		holdings: params.holdings,
		txCount:
			typeof params.txCount === 'number'
				? params.txCount.toString()
				: undefined,
		lastActive: params.lastActive,
		created: params.created,
		feeToken: params.feeToken,
		tokens: params.tokens,
		isContract: params.isContract,
		methods: params.methods,
	}
	return buildAddressOgUrl(OG_BASE_URL, ogParams)
}

const CHAIN_ID = config.getClient().chain.id

// Indexer setup for token holder queries
const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})
const QB = IDX.QueryBuilder.from(IS)
const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 tokens)'

// ============ Transaction OG ============

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
		const receipt = await getTransactionReceipt(config, {
			hash: hash as `0x${string}`,
		})

		const [block, transaction, getTokenMetadata] = await Promise.all([
			getBlock(config, { blockHash: receipt.blockHash }),
			getTransaction(config, { hash: receipt.transactionHash }),
			Tip20.metadataFromLogs(receipt.logs),
		])

		const gasUsed = receipt.gasUsed ?? 0n
		const gasPrice = receipt.effectiveGasPrice ?? transaction.gasPrice ?? 0n
		const feeWei = gasUsed * gasPrice
		const feeUsd = Number.parseFloat(Value.format(feeWei, 18))

		const timestamp = Number(block.timestamp) * 1000

		const feeStr =
			feeUsd < 0.01 ? '<$0.01' : `$${feeUsd.toFixed(feeUsd < 1 ? 3 : 2)}`

		let events: KnownEvent[] = []
		try {
			events = parseKnownEvents(receipt, { transaction, getTokenMetadata })
				.filter(preferredEventsFilter)
				.slice(0, 6)

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
			blockNumber: block.number.toString(),
			from: receipt.from,
			timestamp,
			fee: feeStr,
			total: feeStr,
			events,
		}
	} catch {
		return null
	}
}

export async function buildTxOgData(hash: string): Promise<{
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

		txData.events.forEach((event, index) => {
			if (index < 6) {
				// Use `ev{n}` instead of `e{n}` to avoid potential upstream query-param filtering.
				// The OG renderer supports both.
				params.set(`ev${index + 1}`, formatEventForOgServer(event))
			}
		})
	}

	return {
		url: `${OG_BASE_URL}/tx/${hash}?${params.toString()}`,
		description: buildTxDescription(txData),
	}
}

// ============ Token OG ============

interface TokenData {
	name: string
	symbol: string
	currency: string
	holders: number
	supply: string
	created: string
	quoteToken?: string
}

async function fetchTokenIndexerData(
	address: string,
): Promise<{ holders: number; created: string }> {
	try {
		const qb = QB.withSignatures([TRANSFER_SIGNATURE])
		const tokenAddress = address.toLowerCase() as Address.Address

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
	} catch (error) {
		console.error('Failed to fetch token indexer data:', error)
		return { holders: 0, created: '—' }
	}
}

async function fetchTokenData(address: string): Promise<TokenData | null> {
	try {
		const tokenAddress = address as Address.Address

		const [tokenData, indexerData] = await Promise.all([
			Promise.all([
				readContract(config, {
					address: tokenAddress,
					abi: Abis.tip20,
					functionName: 'name',
				}).catch(() => '—'),
				readContract(config, {
					address: tokenAddress,
					abi: Abis.tip20,
					functionName: 'symbol',
				}).catch(() => '—'),
				readContract(config, {
					address: tokenAddress,
					abi: Abis.tip20,
					functionName: 'decimals',
				}).catch(() => 18),
				readContract(config, {
					address: tokenAddress,
					abi: Abis.tip20,
					functionName: 'totalSupply',
				}).catch(() => 0n),
			]),
			fetchTokenIndexerData(address),
		])

		const [name, symbol, decimals, totalSupplyRaw] = tokenData

		const totalSupply = Number.parseFloat(
			Value.format(totalSupplyRaw, decimals),
		)

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

async function hasFeeAmmLiquidity(tokenAddress: string): Promise<boolean> {
	try {
		const FEE_MANAGER =
			'0xfeec000000000000000000000000000000000000' as Address.Address
		const PATH_USD = '0x20c0000000000000000000000000000000000000'
		const ALPHA_USD = '0x20c0000000000000000000000000000000000001'

		const pairToken =
			tokenAddress.toLowerCase() === PATH_USD.toLowerCase()
				? ALPHA_USD
				: PATH_USD

		const getPoolAbi = [
			{
				type: 'function',
				name: 'getPool',
				inputs: [
					{ name: 'tokenA', type: 'address' },
					{ name: 'tokenB', type: 'address' },
				],
				outputs: [
					{ name: 'reserveUser', type: 'uint256' },
					{ name: 'reserveValidator', type: 'uint256' },
				],
			},
		] as const

		const result = await readContract(config, {
			address: FEE_MANAGER,
			abi: getPoolAbi,
			functionName: 'getPool',
			args: [tokenAddress as Address.Address, pairToken as Address.Address],
		})

		const [reserveUser, reserveValidator] = result as [bigint, bigint]
		return reserveUser > 0n || reserveValidator > 0n
	} catch {
		return false
	}
}

export async function buildTokenOgData(address: string): Promise<{
	url: string
	description: string
}> {
	const tokenData = await fetchTokenData(address)

	const isTIP20 = address.toLowerCase().startsWith('0x20c')
	let isFeeToken = false
	if (isTIP20 && tokenData?.currency === 'USD') {
		isFeeToken = await hasFeeAmmLiquidity(address)
	}

	const params = new URLSearchParams()
	if (tokenData) {
		params.set('name', truncateOgText(tokenData.name, 40))
		params.set('symbol', truncateOgText(tokenData.symbol, 16))
		params.set('holders', tokenData.holders.toString())
		params.set('supply', tokenData.supply)
		params.set('created', tokenData.created)
		if (isFeeToken) {
			params.set('isFeeToken', 'true')
		}
	}

	return {
		url: `${OG_BASE_URL}/token/${address}?${params.toString()}`,
		description: buildTokenDescription(tokenData),
	}
}

// ============ Address OG ============

interface AddressData {
	holdings: string
	txCount: number
	lastActive: string
	created: string
	feeToken: string
	tokensHeld: string[]
	isContract: boolean
	methods: string[]
}

async function fetchAddressData(address: string): Promise<AddressData | null> {
	try {
		const tokenAddress = address.toLowerCase() as Address.Address
		const qb = QB.withSignatures([TRANSFER_SIGNATURE])

		let isContract = false
		try {
			const code = await getBytecode(config, {
				address: address as Address.Address,
			})

			if (!code || code === '0x') {
				isContract = false
			} else if (code.toLowerCase().startsWith('0xef0100')) {
				isContract = false
			} else {
				isContract = true
			}
		} catch {
			// Ignore errors, assume not a contract
		}

		let detectedMethods: string[] = []
		if (isContract) {
			const addrLower = address.toLowerCase()

			if (addrLower === '0x20fc000000000000000000000000000000000000') {
				detectedMethods = ['createToken', 'isTIP20', 'tokenIdCounter']
			} else if (addrLower === '0xfeec000000000000000000000000000000000000') {
				detectedMethods = [
					'getPool',
					'setUserToken',
					'setValidatorToken',
					'rebalanceSwap',
				]
			} else if (addrLower === '0xdec0000000000000000000000000000000000000') {
				detectedMethods = [
					'swap',
					'getQuote',
					'addLiquidity',
					'removeLiquidity',
				]
			} else if (addrLower === '0x403c000000000000000000000000000000000000') {
				detectedMethods = ['isAuthorized', 'getPolicyOwner', 'createPolicy']
			} else if (addrLower.startsWith('0x20c')) {
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
				try {
					const symbol = await readContract(config, {
						address: address as Address.Address,
						abi: Abis.tip20,
						functionName: 'symbol',
					})
					if (symbol) {
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

		const balances = new Map<string, bigint>()
		for (const row of incoming) {
			const current = balances.get(row.address) ?? 0n
			balances.set(row.address, current + BigInt(row.tokens))
		}
		for (const row of outgoing) {
			const current = balances.get(row.address) ?? 0n
			balances.set(row.address, current - BigInt(row.tokens))
		}

		const tokensWithBalance = Array.from(balances.entries())
			.filter(([, balance]) => balance > 0n)
			.map(([addr]) => addr)

		const tokensHeld: string[] = []
		const symbolResults = await Promise.all(
			tokensWithBalance.slice(0, 12).map(async (tokenAddr) => {
				try {
					return await readContract(config, {
						address: tokenAddr as Address.Address,
						abi: Abis.tip20,
						functionName: 'symbol',
					})
				} catch {
					return null
				}
			}),
		)
		for (const symbol of symbolResults) {
			if (symbol) tokensHeld.push(symbol)
		}

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
			txCount = incoming.length + outgoing.length
		}

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

		const KNOWN_TOKENS = [
			'0x20c0000000000000000000000000000000000000',
			'0x20c0000000000000000000000000000000000001',
			'0x20c0000000000000000000000000000000000002',
			'0x20c0000000000000000000000000000000000003',
		] as const

		let totalValue = 0
		const PRICE_PER_TOKEN = 1
		const knownTokensHeld: string[] = []

		const knownTokenResults = await Promise.all(
			KNOWN_TOKENS.map(async (tokenAddr) => {
				try {
					const [balance, decimals, symbol] = await Promise.all([
						readContract(config, {
							address: tokenAddr,
							abi: Abis.tip20,
							functionName: 'balanceOf',
							args: [address as Address.Address],
						}),
						readContract(config, {
							address: tokenAddr,
							abi: Abis.tip20,
							functionName: 'decimals',
						}),
						readContract(config, {
							address: tokenAddr,
							abi: Abis.tip20,
							functionName: 'symbol',
						}),
					])
					return { balance, decimals, symbol }
				} catch {
					return null
				}
			}),
		)

		for (const result of knownTokenResults) {
			if (!result) continue
			const { balance, decimals, symbol } = result

			if (balance > 0n) {
				totalValue +=
					Number.parseFloat(Value.format(balance, decimals)) * PRICE_PER_TOKEN

				if (symbol && !knownTokensHeld.includes(symbol)) {
					knownTokensHeld.push(symbol)
				}
			}
		}

		const allTokensHeld = [
			...new Set([...knownTokensHeld, ...tokensHeld]),
		].slice(0, 8)

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
	} catch (error) {
		console.error('Failed to fetch address data:', error)
		return null
	}
}

export async function buildAddressOgData(address: string): Promise<{
	url: string
	description: string
	isContract: boolean
}> {
	const addressData = await fetchAddressData(address)

	const params = new URLSearchParams()
	if (addressData) {
		params.set('holdings', truncateOgText(addressData.holdings, 20))
		params.set('txCount', addressData.txCount.toString())
		params.set('lastActive', addressData.lastActive)
		params.set('created', addressData.created)
		params.set('feeToken', truncateOgText(addressData.feeToken, 16))
		if (addressData.tokensHeld.length > 0) {
			const truncatedTokens = addressData.tokensHeld.map((t) =>
				truncateOgText(t, 10),
			)
			params.set('tokens', truncatedTokens.join(','))
		}
		if (addressData.isContract) {
			params.set('isContract', 'true')
			if (addressData.methods.length > 0) {
				const truncatedMethods = addressData.methods.map((m) =>
					truncateOgText(m, 14),
				)
				params.set('methods', truncatedMethods.join(','))
			}
		}
	}

	return {
		url: `${OG_BASE_URL}/address/${address}?${params.toString()}`,
		description: buildAddressDescription(addressData, address),
		isContract: addressData?.isContract ?? false,
	}
}
