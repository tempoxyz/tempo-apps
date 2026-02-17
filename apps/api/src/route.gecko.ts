import { Hono } from 'hono'
import * as IDX from 'idxs'
import * as z from 'zod/mini'
import { zValidator } from '@hono/zod-validator'
import { getPublicClient } from 'wagmi/actions'
import { Abis, Addresses } from 'viem/tempo'
import {
	formatUnits,
	getAddress,
	keccak256,
	concat,
	type Address,
	type Hex,
} from 'viem'

import { wagmiConfig } from '#wagmi.config.ts'
import { toUnixTimestamp, computePriceNative } from '#gecko.utils.ts'

const indexer = IDX.IndexSupply.create({
	apiKey: process.env.INDEX_SUPPLY_API_KEY,
})
const QB = IDX.QueryBuilder.from(indexer)

const ORDER_PLACED_SIGNATURE =
	'event OrderPlaced(uint128 indexed orderId, address indexed maker, address indexed token, uint128 amount, bool isBid, int16 tick, bool isFlipOrder, int16 flipTick)'

const ORDER_FILLED_SIGNATURE =
	'event OrderFilled(uint128 indexed orderId, address indexed maker, address indexed taker, uint128 amountFilled, bool partialFill)'

const TRANSFER_SIGNATURE =
	'event Transfer(address indexed from, address indexed to, uint256 value)'

const PAIR_CREATED_SIGNATURE =
	'event PairCreated(bytes32 indexed key, address indexed base, address indexed quote)'

const DEX_KEY = 'tempo-stablecoin-dex'
const DEX_ADDRESS = Addresses.stablecoinDex as Address

const cache = {
	priceScale: undefined as number | undefined,
	decimals: new Map<string, number>(),
	books: new Map<string, { base: Address; quote: Address }>(),
	tickPrices: new Map<number, bigint>(),
	quoteTokens: new Map<string, Address>(),
	pairCreation: new Map<
		string,
		{
			blockNumber: number
			blockTimestamp: number
			txnHash: string
		}
	>(),
}

const DEFAULT_CHAIN_ID = 4217 as (typeof wagmiConfig.chains)[number]['id']

type ChainId = (typeof wagmiConfig.chains)[number]['id']

const validChainIds = new Set<number>(wagmiConfig.chains.map((c) => c.id))

function parseChainId(raw: string | undefined): ChainId {
	if (!raw) return DEFAULT_CHAIN_ID
	const n = Number(raw)
	if (!validChainIds.has(n)) throw new Error(`Invalid chainId: ${raw}`)
	return n as ChainId
}

function validationError(
	result: { success: boolean; error?: unknown },
	context: { json: (data: unknown, status: number) => Response },
) {
	if (!result.success)
		return context.json(
			{
				error:
					result.error &&
					typeof result.error === 'object' &&
					'issues' in result.error
						? result.error
						: String(result.error),
			},
			400,
		)
}

function getClient(chainId: ChainId) {
	const client = getPublicClient(wagmiConfig, { chainId })
	if (!client) throw new Error(`No client for chainId ${chainId}`)
	return client
}

const geckoApp = new Hono<{ Bindings: Cloudflare.Env }>()

// ---------------------------------------------------------------------------
// GET /latest-block
// ---------------------------------------------------------------------------
geckoApp.get('/latest-block', async (context) => {
	const id = parseChainId(context.req.param('chainId'))

	const block = await QB.selectFrom('blocks')
		.select(['num', 'timestamp'])
		.where('chain', '=', id)
		.orderBy('num', 'desc')
		.limit(1)
		.executeTakeFirstOrThrow()

	return context.json({
		block: {
			blockNumber: Number(block.num),
			blockTimestamp: toUnixTimestamp(block.timestamp),
		},
	})
})

// ---------------------------------------------------------------------------
// GET /asset?id=<address>
// ---------------------------------------------------------------------------
geckoApp.get(
	'/asset',
	zValidator('query', z.object({ id: z.string() }), validationError),
	async (context) => {
		const { id } = context.req.valid('query')
		const client = getClient(parseChainId(context.req.param('chainId')))
		const address = id as Address

		const read = (
			functionName: 'name' | 'symbol' | 'decimals' | 'totalSupply',
		) => client.readContract({ address, abi: Abis.tip20, functionName })

		const [name, symbol, decimals, totalSupply] = await Promise.all([
			read('name'),
			read('symbol'),
			read('decimals'),
			read('totalSupply'),
		]).catch(() => [null, null, null, null] as const)

		if (
			name === null ||
			symbol === null ||
			decimals === null ||
			totalSupply === null
		)
			return context.json({ error: 'Failed to read asset' }, 500)

		const dec = Number(decimals)

		return context.json({
			asset: {
				id: getAddress(id),
				name,
				symbol,
				decimals: dec,
				totalSupply: formatUnits(BigInt(totalSupply), dec),
			},
		})
	},
)

// ---------------------------------------------------------------------------
// GET /pair?id=<pairKey hex>
// ---------------------------------------------------------------------------
geckoApp.get(
	'/pair',
	zValidator('query', z.object({ id: z.string() }), validationError),
	async (context) => {
		const { id } = context.req.valid('query')
		const chainId = parseChainId(context.req.param('chainId'))
		const client = getClient(chainId)
		const pairKey = id as Hex

		let bookRes = cache.books.get(pairKey)
		if (!bookRes) {
			const res = await client.readContract({
				address: DEX_ADDRESS,
				abi: Abis.stablecoinDex,
				functionName: 'books',
				args: [pairKey],
			})
			bookRes = { base: res.base, quote: res.quote }
			cache.books.set(pairKey, bookRes)
		}

		const cid = chainId
		let creation = cache.pairCreation.get(pairKey)
		if (!creation) {
			const row = await QB.withSignatures([PAIR_CREATED_SIGNATURE])
				.selectFrom('paircreated')
				.select(['block_num', 'block_timestamp', 'tx_hash'])
				.where('chain', '=', cid)
				.where('address', '=', DEX_ADDRESS)
				.where('key', '=', pairKey)
				.orderBy('block_num', 'asc')
				.limit(1)
				.executeTakeFirst()

			if (row) {
				creation = {
					blockNumber: Number(row.block_num),
					blockTimestamp: toUnixTimestamp(row.block_timestamp),
					txnHash: String(row.tx_hash),
				}
				cache.pairCreation.set(pairKey, creation)
			}
		}

		return context.json({
			pair: {
				id,
				dexKey: DEX_KEY,
				asset0Id: getAddress(bookRes.base),
				asset1Id: getAddress(bookRes.quote),
				...(creation && {
					createdAtBlockNumber: creation.blockNumber,
					createdAtBlockTimestamp: creation.blockTimestamp,
					createdAtTxnId: creation.txnHash,
				}),
			},
		})
	},
)

// ---------------------------------------------------------------------------
// GET /pairs
// ---------------------------------------------------------------------------
geckoApp.get('/pairs', async (context) => {
	const chainId = parseChainId(context.req.param('chainId'))
	const client = getClient(chainId)

	const pairRows = await QB.withSignatures([PAIR_CREATED_SIGNATURE])
		.selectFrom('paircreated')
		.select(['key', 'base', 'quote', 'block_num', 'block_timestamp', 'tx_hash'])
		.where('chain', '=', chainId)
		.where('address', '=', DEX_ADDRESS)
		.orderBy('block_num', 'asc')
		.execute()
		.catch(() => [])

	if (pairRows.length === 0) return context.json({ pairs: [] })

	const uniqueTokens = [
		...new Set(
			pairRows.flatMap((r) => [
				String(r.base).toLowerCase(),
				String(r.quote).toLowerCase(),
			]),
		),
	] as Address[]

	const [balanceResults, decimalResults, nameResults, symbolResults] =
		await Promise.all([
			Promise.allSettled(
				uniqueTokens.map((token) =>
					client.readContract({
						address: token,
						abi: Abis.tip20,
						functionName: 'balanceOf',
						args: [DEX_ADDRESS],
					}),
				),
			),
			Promise.all(
				uniqueTokens
					.filter((t) => !cache.decimals.has(t.toLowerCase()))
					.map((token) =>
						client.readContract({
							address: token,
							abi: Abis.tip20,
							functionName: 'decimals',
						}),
					),
			),
			Promise.all(
				uniqueTokens.map((token) =>
					client
						.readContract({
							address: token,
							abi: Abis.tip20,
							functionName: 'name',
						})
						.catch(() => null),
				),
			),
			Promise.all(
				uniqueTokens.map((token) =>
					client
						.readContract({
							address: token,
							abi: Abis.tip20,
							functionName: 'symbol',
						})
						.catch(() => null),
				),
			),
		])

	const uncachedTokens = uniqueTokens.filter(
		(t) => !cache.decimals.has(t.toLowerCase()),
	)
	for (let i = 0; i < uncachedTokens.length; i++) {
		const res = decimalResults[i]
		const token = uncachedTokens[i]
		if (res !== undefined && token)
			cache.decimals.set(token.toLowerCase(), Number(res))
	}

	const balances = new Map<string, bigint>()
	const names = new Map<string, string>()
	const symbols = new Map<string, string>()
	for (let i = 0; i < uniqueTokens.length; i++) {
		const token = uniqueTokens[i]
		if (!token) continue
		const bal = balanceResults[i]
		balances.set(
			token.toLowerCase(),
			bal?.status === 'fulfilled' ? bal.value : 0n,
		)
		const name = nameResults[i]
		if (name) names.set(token.toLowerCase(), name)
		const symbol = symbolResults[i]
		if (symbol) symbols.set(token.toLowerCase(), symbol)
	}

	const pairs = pairRows.map((row) => {
		const base = String(row.base).toLowerCase()
		const quote = String(row.quote).toLowerCase()
		const baseDec = cache.decimals.get(base) ?? 18
		const quoteDec = cache.decimals.get(quote) ?? 18
		const baseReserve = balances.get(base) ?? 0n
		const quoteReserve = balances.get(quote) ?? 0n

		return {
			id: String(row.key),
			dexKey: DEX_KEY,
			asset0Id: getAddress(String(row.base)),
			asset1Id: getAddress(String(row.quote)),
			asset0Symbol: symbols.get(base) ?? null,
			asset1Symbol: symbols.get(quote) ?? null,
			asset0Name: names.get(base) ?? null,
			asset1Name: names.get(quote) ?? null,
			reserves: {
				asset0: formatUnits(baseReserve, baseDec),
				asset1: formatUnits(quoteReserve, quoteDec),
			},
			createdAtBlockNumber: Number(row.block_num),
			createdAtBlockTimestamp: toUnixTimestamp(row.block_timestamp),
			createdAtTxnId: String(row.tx_hash),
		}
	})

	pairs.sort((a, b) => {
		const aTotal = Number(a.reserves.asset0) + Number(a.reserves.asset1)
		const bTotal = Number(b.reserves.asset0) + Number(b.reserves.asset1)
		return bTotal - aTotal
	})

	return context.json({ pairs })
})

// ---------------------------------------------------------------------------
// GET /events?fromBlock=<number>&toBlock=<number>
// ---------------------------------------------------------------------------
geckoApp.get(
	'/events',
	zValidator(
		'query',
		z.object({
			fromBlock: z.coerce.number(),
			toBlock: z.coerce.number(),
		}),
		validationError,
	),
	async (context) => {
		const { fromBlock, toBlock } = context.req.valid('query')
		const cid = parseChainId(context.req.param('chainId'))
		const client = getClient(cid)

		if (!cache.priceScale) {
			cache.priceScale = await client.readContract({
				address: DEX_ADDRESS,
				abi: Abis.stablecoinDex,
				functionName: 'PRICE_SCALE',
			})
		}
		const priceScale = cache.priceScale

		const filledRows = await QB.withSignatures([ORDER_FILLED_SIGNATURE])
			.selectFrom('orderfilled')
			.select([
				'orderId',
				'maker',
				'taker',
				'amountFilled',
				'partialFill',
				'block_num',
				'block_timestamp',
				'tx_hash',
				'log_idx',
			])
			.where('chain', '=', cid)
			.where('address', '=', DEX_ADDRESS)
			.where('block_num', '>=', BigInt(fromBlock))
			.where('block_num', '<=', BigInt(toBlock))
			.orderBy('block_num', 'asc')
			.orderBy('log_idx', 'asc')
			.execute()

		if (filledRows.length === 0) return context.json({ events: [] })

		const uniqueOrderIds = [
			...new Set(filledRows.map((r) => BigInt(r.orderId))),
		]
		type Order = {
			orderId: bigint
			maker: Address
			bookKey: Hex
			isBid: boolean
			tick: number
			amount: bigint
			remaining: bigint
		}
		const orderMap = new Map<string, Order>()
		const orderResults = await Promise.allSettled(
			uniqueOrderIds.map((orderId) =>
				client.readContract({
					address: DEX_ADDRESS,
					abi: Abis.stablecoinDex,
					functionName: 'getOrder',
					args: [orderId],
				}),
			),
		)
		const missingOrderIds: bigint[] = []
		for (let i = 0; i < uniqueOrderIds.length; i++) {
			const res = orderResults[i]
			const oid = uniqueOrderIds[i]
			if (oid === undefined) continue
			if (res?.status !== 'fulfilled') {
				missingOrderIds.push(oid)
				continue
			}
			const r = res.value
			orderMap.set(oid.toString(), {
				orderId: r.orderId,
				maker: r.maker,
				bookKey: r.bookKey,
				isBid: r.isBid,
				tick: r.tick,
				amount: r.amount,
				remaining: r.remaining,
			})
		}

		if (missingOrderIds.length > 0) {
			const rows = await QB.withSignatures([ORDER_PLACED_SIGNATURE])
				.selectFrom('orderplaced')
				.select(['orderId', 'maker', 'token', 'amount', 'isBid', 'tick'])
				.where('chain', '=', cid)
				.where('orderId', 'in', missingOrderIds)
				.execute()

			const uniqueBaseTokens = [
				...new Set(rows.map((r) => (r.token as string).toLowerCase())),
			]
			const uncachedBaseTokens = uniqueBaseTokens.filter(
				(t) => !cache.quoteTokens.has(t),
			)
			if (uncachedBaseTokens.length > 0) {
				const quoteResults = await Promise.all(
					uncachedBaseTokens.map((token) =>
						client.readContract({
							address: token as Address,
							abi: Abis.tip20,
							functionName: 'quoteToken',
						}),
					),
				)
				for (let i = 0; i < uncachedBaseTokens.length; i++) {
					const qt = quoteResults[i]
					const base = uncachedBaseTokens[i]
					if (qt && base) cache.quoteTokens.set(base, qt)
				}
			}

			for (const row of rows) {
				const base = String(row.token).toLowerCase() as Address
				const quote = cache.quoteTokens.get(base)
				if (!quote) continue
				const bookKey = keccak256(
					concat([base as Hex, quote.toLowerCase() as Hex]),
				)
				orderMap.set(String(row.orderId), {
					orderId: BigInt(row.orderId),
					maker: String(row.maker) as Address,
					bookKey: bookKey as Hex,
					isBid: Boolean(row.isBid),
					tick: Number(row.tick),
					amount: BigInt(row.amount),
					remaining: 0n,
				})
			}
		}

		const uncachedBookKeys: Hex[] = []
		const uncachedTicks: number[] = []
		for (const order of orderMap.values()) {
			if (!cache.books.has(order.bookKey)) uncachedBookKeys.push(order.bookKey)
			if (!cache.tickPrices.has(order.tick)) uncachedTicks.push(order.tick)
		}

		const [bookResults, tickResults] = await Promise.all([
			Promise.all(
				uncachedBookKeys.map((key) =>
					client.readContract({
						address: DEX_ADDRESS,
						abi: Abis.stablecoinDex,
						functionName: 'books',
						args: [key],
					}),
				),
			),
			Promise.all(
				uncachedTicks.map((tick) =>
					client.readContract({
						address: DEX_ADDRESS,
						abi: Abis.stablecoinDex,
						functionName: 'tickToPrice',
						args: [tick],
					}),
				),
			),
		])

		for (let i = 0; i < uncachedBookKeys.length; i++) {
			const res = bookResults[i]
			const key = uncachedBookKeys[i]
			if (res && key)
				cache.books.set(key, {
					base: res.base,
					quote: res.quote,
				})
		}

		for (let i = 0; i < uncachedTicks.length; i++) {
			const res = tickResults[i]
			const tick = uncachedTicks[i]
			if (res !== undefined && tick !== undefined)
				cache.tickPrices.set(tick, BigInt(res))
		}

		const tokenSet = new Set<Address>()
		for (const order of orderMap.values()) {
			const book = cache.books.get(order.bookKey)
			if (book) {
				tokenSet.add(book.base)
				tokenSet.add(book.quote)
			}
		}
		const uniqueTokens = [...tokenSet]

		const uncachedTokens = uniqueTokens.filter(
			(t) => !cache.decimals.has(t.toLowerCase()),
		)

		const uniqueBlockNumbers = [
			...new Set(filledRows.map((r) => BigInt(r.block_num))),
		]
		const minBlock = uniqueBlockNumbers.reduce((a, b) => (a < b ? a : b))

		const transferQB = QB.withSignatures([TRANSFER_SIGNATURE])

		const uniqueTxHashes = [
			...new Set(filledRows.map((r) => String(r.tx_hash) as Hex)),
		]

		const [
			decimalResults,
			transfersTo,
			transfersFrom,
			initialResults,
			txIdxRows,
		] = await Promise.all([
			Promise.all(
				uncachedTokens.map((token) =>
					client.readContract({
						address: token,
						abi: Abis.tip20,
						functionName: 'decimals',
					}),
				),
			),
			transferQB
				.selectFrom('transfer')
				.select(['from', 'to', 'value', 'address', 'block_num'])
				.where('chain', '=', cid)
				.where('to', '=', DEX_ADDRESS)
				.where('address', 'in', uniqueTokens)
				.where('block_num', '>=', minBlock)
				.where('block_num', '<=', BigInt(toBlock))
				.execute(),
			transferQB
				.selectFrom('transfer')
				.select(['from', 'to', 'value', 'address', 'block_num'])
				.where('chain', '=', cid)
				.where('from', '=', DEX_ADDRESS)
				.where('address', 'in', uniqueTokens)
				.where('block_num', '>=', minBlock)
				.where('block_num', '<=', BigInt(toBlock))
				.execute(),
			Promise.allSettled(
				uniqueTokens.map((token) =>
					client.readContract({
						address: token,
						abi: Abis.tip20,
						functionName: 'balanceOf',
						args: [DEX_ADDRESS],
						blockNumber: minBlock > 0n ? minBlock - 1n : 0n,
					}),
				),
			),
			QB.selectFrom('txs')
				.select(['hash', 'idx'])
				.where('chain', '=', cid)
				.where('hash', 'in', uniqueTxHashes)
				.execute(),
		])

		const txIdxMap = new Map<string, number>()
		for (const row of txIdxRows) {
			txIdxMap.set(String(row.hash).toLowerCase(), Number(row.idx))
		}

		for (let i = 0; i < uncachedTokens.length; i++) {
			const res = decimalResults[i]
			const token = uncachedTokens[i]
			if (res !== undefined && token)
				cache.decimals.set(token.toLowerCase(), Number(res))
		}

		const initialBalances = new Map<string, bigint>()
		for (let i = 0; i < uniqueTokens.length; i++) {
			const res = initialResults[i]
			const token = uniqueTokens[i]
			if (token)
				// Falls back to 0 when balanceOf reverts — e.g. the token didn't
				// exist prior to the queried block range (minBlock - 1).
				initialBalances.set(
					token.toLowerCase(),
					res?.status === 'fulfilled' ? res.value : 0n,
				)
		}

		type Delta = { block: bigint; token: string; delta: bigint }
		const deltas: Delta[] = []
		for (const row of transfersTo) {
			if (!row.value || !row.address) continue
			deltas.push({
				block: BigInt(row.block_num),
				token: String(row.address).toLowerCase(),
				delta: BigInt(row.value),
			})
		}
		for (const row of transfersFrom) {
			if (!row.value || !row.address) continue
			deltas.push({
				block: BigInt(row.block_num),
				token: String(row.address).toLowerCase(),
				delta: -BigInt(row.value),
			})
		}
		deltas.sort((a, b) => Number(a.block - b.block))

		const blockReserveMap = new Map<bigint, Map<string, bigint>>()
		const running = new Map<string, bigint>()
		for (const token of uniqueTokens) {
			running.set(
				token.toLowerCase(),
				initialBalances.get(token.toLowerCase()) ?? 0n,
			)
		}

		const sortedBlocks = [...uniqueBlockNumbers].sort((a, b) => Number(a - b))
		let deltaIdx = 0
		for (const bn of sortedBlocks) {
			while (deltaIdx < deltas.length) {
				const d = deltas[deltaIdx]
				if (!d || d.block > bn) break
				running.set(d.token, (running.get(d.token) ?? 0n) + d.delta)
				deltaIdx++
			}
			blockReserveMap.set(bn, new Map(running))
		}

		type SwapEvent = {
			block: { blockNumber: number; blockTimestamp: number }
			eventType: 'swap'
			txnId: string
			txnIndex: number
			eventIndex: number
			maker: string
			pairId: string
			asset0In?: string
			asset1In?: string
			asset0Out?: string
			asset1Out?: string
			priceNative: string
			reserves: { asset0: string; asset1: string }
		}
		const events: SwapEvent[] = []

		const txEventCounters = new Map<string, number>()

		for (const row of filledRows) {
			const orderId = BigInt(row.orderId)
			const taker = getAddress(String(row.taker))
			const amountFilled = BigInt(row.amountFilled)
			const blockNum = BigInt(row.block_num)
			const blockTimestamp = toUnixTimestamp(row.block_timestamp)
			const txHash = String(row.tx_hash)

			const order = orderMap.get(orderId.toString())
			if (!order) continue

			const book = cache.books.get(order.bookKey)
			if (!book) continue

			const baseDecimals = cache.decimals.get(book.base.toLowerCase())
			const quoteDecimals = cache.decimals.get(book.quote.toLowerCase())
			if (baseDecimals === undefined || quoteDecimals === undefined) continue

			const tickPrice = cache.tickPrices.get(order.tick)
			if (tickPrice === undefined) continue

			const scale = BigInt(priceScale)

			let asset0In: string | undefined
			let asset1In: string | undefined
			let asset0Out: string | undefined
			let asset1Out: string | undefined
			let baseAmountDec: string
			let quoteAmountDec: string

			if (order.isBid) {
				const quoteAmount = amountFilled
				const baseAmount = (amountFilled * scale) / tickPrice
				baseAmountDec = formatUnits(baseAmount, baseDecimals)
				quoteAmountDec = formatUnits(quoteAmount, quoteDecimals)
				asset0In = baseAmountDec
				asset1Out = quoteAmountDec
			} else {
				const baseAmount = amountFilled
				const quoteAmount = (amountFilled * tickPrice) / scale
				baseAmountDec = formatUnits(baseAmount, baseDecimals)
				quoteAmountDec = formatUnits(quoteAmount, quoteDecimals)
				asset0Out = baseAmountDec
				asset1In = quoteAmountDec
			}

			const blockReserves = blockReserveMap.get(blockNum)
			const baseReserve = blockReserves?.get(book.base.toLowerCase()) ?? 0n
			const quoteReserve = blockReserves?.get(book.quote.toLowerCase()) ?? 0n

			const priceNative = computePriceNative(
				tickPrice,
				baseDecimals,
				quoteDecimals,
				scale,
			)
			if (tickPrice === 0n) continue

			const txnIndex = txIdxMap.get(txHash.toLowerCase())
			if (txnIndex === undefined) continue
			const eventIndex = txEventCounters.get(txHash) ?? 0
			txEventCounters.set(txHash, eventIndex + 1)

			events.push({
				block: {
					blockNumber: Number(blockNum),
					blockTimestamp,
				},
				eventType: 'swap',
				txnId: txHash,
				txnIndex,
				eventIndex,
				maker: taker,
				pairId: order.bookKey,
				...(asset0In !== undefined && { asset0In }),
				...(asset1In !== undefined && { asset1In }),
				...(asset0Out !== undefined && { asset0Out }),
				...(asset1Out !== undefined && { asset1Out }),
				priceNative,
				// NOTE: reserves reflect the DEX contract's total token balance, not
				// per-pair liquidity. The contract doesn't expose per-pair reserves;
				// accurate values would require scanning all tick levels per pair.
				reserves: {
					asset0: formatUnits(baseReserve, baseDecimals),
					asset1: formatUnits(quoteReserve, quoteDecimals),
				},
			})
		}

		return context.json({ events })
	},
)

export { geckoApp }
