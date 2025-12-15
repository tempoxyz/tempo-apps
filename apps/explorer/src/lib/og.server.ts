import * as IDX from 'idxs'
import type { Address } from 'ox'
import { Actions } from 'tempo.ts/wagmi'
import type { Log, TransactionReceipt } from 'viem'
import { zeroAddress } from 'viem'
import {
	type KnownEvent,
	parseKnownEvents,
	preferredEventsFilter,
} from '#lib/domain/known-events'
import * as Tip20 from '#lib/domain/tip20'
import {
	OG_BASE_URL,
	buildAddressDescription,
	buildTokenDescription,
	buildTxDescription,
	formatDate,
	formatDateTime,
	formatEventForOgServer,
	formatTime,
	truncateOgText,
} from '#lib/og'
import { config } from '#wagmi.config'

export { OG_BASE_URL, OgMetaInjector, OgMetaRemover } from '#lib/og'

const RPC_URL = 'https://rpc-orchestra.testnet.tempo.xyz'
const CHAIN_ID = 42429 // Testnet chain ID

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

		const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed) : 0n
		const gasPrice = receipt.effectiveGasPrice
			? BigInt(receipt.effectiveGasPrice)
			: txJson.result?.gasPrice
				? BigInt(txJson.result.gasPrice)
				: 0n
		const feeWei = gasUsed * gasPrice
		const feeUsd = Number(feeWei) / 1e18

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

		const feeStr =
			feeUsd < 0.01 ? '<$0.01' : `$${feeUsd.toFixed(feeUsd < 1 ? 3 : 2)}`

		let events: KnownEvent[] = []
		try {
			const transaction = txJson.result
				? {
						to: txJson.result.to as Address.Address | undefined,
						input: txJson.result.input as `0x${string}` | undefined,
					}
				: undefined

			const getTokenMetadata = await Tip20.metadataFromLogs(
				receipt.logs as Log[],
			)

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
				params.set(`e${index + 1}`, formatEventForOgServer(event))
			}
		})
	}

	return {
		url: `${OG_BASE_URL}/tx/${hash}?${params.toString()}`,
		description: buildTxDescription(txData, hash),
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
	} catch (e) {
		console.error('Failed to fetch token indexer data:', e)
		return { holders: 0, created: '—' }
	}
}

async function fetchTokenData(address: string): Promise<TokenData | null> {
	try {
		const calls = [
			{
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [{ to: address, data: '0x06fdde03' }, 'latest'],
				id: 1,
			},
			{
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [{ to: address, data: '0x95d89b41' }, 'latest'],
				id: 2,
			},
			{
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [{ to: address, data: '0x313ce567' }, 'latest'],
				id: 3,
			},
			{
				jsonrpc: '2.0',
				method: 'eth_call',
				params: [{ to: address, data: '0x18160ddd' }, 'latest'],
				id: 4,
			},
		]

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

		const decodeName = (hex: string | undefined): string => {
			if (!hex || hex === '0x') return '—'
			try {
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
		const FEE_MANAGER = '0xfeec000000000000000000000000000000000000'
		const PATH_USD = '0x20c0000000000000000000000000000000000000'
		const ALPHA_USD = '0x20c0000000000000000000000000000000000001'

		const paddedToken = tokenAddress.slice(2).toLowerCase().padStart(64, '0')
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
			const reserveUser = BigInt(`0x${json.result.slice(2, 66)}`)
			const reserveValidator = BigInt(`0x${json.result.slice(66, 130)}`)
			return reserveUser > 0n || reserveValidator > 0n
		}
		return false
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
		description: buildTokenDescription(tokenData, address),
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

			if (code === '0x') {
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
					const res = await fetch(RPC_URL, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_call',
							params: [{ to: address, data: '0x95d89b41' }, 'latest'],
							id: 1,
						}),
					})
					const json = (await res.json()) as {
						result?: string
						error?: unknown
					}
					if (json.result && json.result !== '0x' && !json.error) {
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
		]

		let totalValue = 0
		const PRICE_PER_TOKEN = 1
		const knownTokensHeld: string[] = []

		for (const tokenAddr of KNOWN_TOKENS) {
			try {
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
							params: [{ to: tokenAddr, data: '0x313ce567' }, 'latest'],
							id: 2,
						}),
					}),
					fetch(RPC_URL, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_call',
							params: [{ to: tokenAddr, data: '0x95d89b41' }, 'latest'],
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
					totalValue += (Number(balance) / 10 ** decimals) * PRICE_PER_TOKEN

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
	} catch (e) {
		console.error('Failed to fetch address data:', e)
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
