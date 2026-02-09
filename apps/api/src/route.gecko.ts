import { Hono } from 'hono'
import * as z from 'zod/mini'
import { zValidator } from '@hono/zod-validator'
import { getPublicClient } from 'wagmi/actions'
import { Abis, Addresses } from 'viem/tempo'
import { formatUnits, getAddress, type Address, type Hex } from 'viem'

import { wagmiConfig } from '#wagmi.config.ts'

const DEX_KEY = 'tempo-stablecoin-dex'
const DEX_ADDRESS = Addresses.stablecoinDex as Address

const DEFAULT_CHAIN_ID = 4217 as (typeof wagmiConfig.chains)[number]['id']

const zOptionalChainId = () =>
	z.optional(
		z.pipe(
			z.coerce.number(),
			z.union(wagmiConfig.chains.map((chain) => z.literal(chain.id))),
		),
	)

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

function getClient(chainId?: (typeof wagmiConfig.chains)[number]['id']) {
	const id = chainId ?? DEFAULT_CHAIN_ID
	const client = getPublicClient(wagmiConfig, { chainId: id })
	if (!client) throw new Error(`No client for chainId ${id}`)
	return client
}

const geckoApp = new Hono<{ Bindings: Cloudflare.Env }>()

// ---------------------------------------------------------------------------
// GET /latest-block
// ---------------------------------------------------------------------------
geckoApp.get(
	'/latest-block',
	zValidator(
		'query',
		z.object({ chainId: zOptionalChainId() }),
		validationError,
	),
	async (context) => {
		const { chainId } = context.req.valid('query')
		const client = getClient(chainId)
		const head = await client.getBlock()

		let blockNumber = head.number
		for (let attempts = 0; attempts < 5; attempts++) {
			try {
				await client.getLogs({
					address: DEX_ADDRESS,
					fromBlock: blockNumber,
					toBlock: blockNumber,
				})
				break
			} catch {
				blockNumber -= 1n
			}
		}

		const block =
			blockNumber === head.number
				? head
				: await client.getBlock({ blockNumber })

		return context.json({
			block: {
				blockNumber: Number(block.number),
				blockTimestamp: Number(block.timestamp),
			},
		})
	},
)

// ---------------------------------------------------------------------------
// GET /asset?id=<address>
// ---------------------------------------------------------------------------
geckoApp.get(
	'/asset',
	zValidator(
		'query',
		z.object({ id: z.string(), chainId: zOptionalChainId() }),
		validationError,
	),
	async (context) => {
		const { id, chainId } = context.req.valid('query')
		const client = getClient(chainId)
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
	zValidator(
		'query',
		z.object({ id: z.string(), chainId: zOptionalChainId() }),
		validationError,
	),
	async (context) => {
		const { id, chainId } = context.req.valid('query')
		const client = getClient(chainId)
		const pairKey = id as Hex

		const [bookRes, creationLogs] = await Promise.all([
			client.readContract({
				address: DEX_ADDRESS,
				abi: Abis.stablecoinDex,
				functionName: 'books',
				args: [pairKey],
			}),
			client
				.getLogs({
					address: DEX_ADDRESS,
					event: {
						name: 'PairCreated',
						type: 'event',
						inputs: [
							{ type: 'bytes32', name: 'key', indexed: true },
							{ type: 'address', name: 'base', indexed: true },
							{ type: 'address', name: 'quote', indexed: true },
						],
					} as const,
					args: { key: pairKey },
					fromBlock: 0n,
					toBlock: 'latest',
				})
				.catch(() => []),
		])

		const creation = creationLogs[0]
		let createdAtBlockNumber: number | undefined
		let createdAtBlockTimestamp: number | undefined
		let createdAtTxnId: string | undefined

		if (creation) {
			createdAtBlockNumber = Number(creation.blockNumber)
			createdAtTxnId = creation.transactionHash
			const block = await client.getBlock({
				blockNumber: creation.blockNumber,
			})
			createdAtBlockTimestamp = Number(block.timestamp)
		}

		return context.json({
			pair: {
				id,
				dexKey: DEX_KEY,
				asset0Id: getAddress(bookRes.base),
				asset1Id: getAddress(bookRes.quote),
				...(createdAtBlockNumber !== undefined && { createdAtBlockNumber }),
				...(createdAtBlockTimestamp !== undefined && {
					createdAtBlockTimestamp,
				}),
				...(createdAtTxnId !== undefined && { createdAtTxnId }),
			},
		})
	},
)

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
			chainId: zOptionalChainId(),
		}),
		validationError,
	),
	async (context) => {
		const { fromBlock, toBlock, chainId } = context.req.valid('query')
		const client = getClient(chainId)

		const latestBlock = await client.getBlock()
		const from = BigInt(fromBlock)
		const to =
			BigInt(toBlock) > latestBlock.number
				? latestBlock.number
				: BigInt(toBlock)

		// Phase 1: Get logs + PRICE_SCALE in parallel
		const [filledLogs, priceScale] = await Promise.all([
			client.getLogs({
				address: DEX_ADDRESS,
				event: {
					name: 'OrderFilled',
					type: 'event',
					inputs: [
						{ type: 'uint128', name: 'orderId', indexed: true },
						{ type: 'address', name: 'maker', indexed: true },
						{ type: 'address', name: 'taker', indexed: true },
						{ type: 'uint128', name: 'amountFilled' },
						{ type: 'bool', name: 'partialFill' },
					],
				} as const,
				fromBlock: from,
				toBlock: to,
			}),
			client.readContract({
				address: DEX_ADDRESS,
				abi: Abis.stablecoinDex,
				functionName: 'PRICE_SCALE',
			}),
		])

		if (filledLogs.length === 0) return context.json({ events: [] })

		// Phase 2: Get order details for unique orderIds
		const uniqueOrderIds = [
			...new Set(
				filledLogs.flatMap((l) =>
					l.args.orderId !== undefined ? [l.args.orderId] : [],
				),
			),
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
		const orderSettled = await Promise.allSettled(
			uniqueOrderIds.map((orderId) =>
				client.readContract({
					address: DEX_ADDRESS,
					abi: Abis.stablecoinDex,
					functionName: 'getOrder',
					args: [orderId],
				}),
			),
		)
		for (let i = 0; i < uniqueOrderIds.length; i++) {
			const res = orderSettled[i]
			const oid = uniqueOrderIds[i]
			if (res?.status !== 'fulfilled' || oid === undefined) continue
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

		// Phase 3: Get pair info + tick prices for unique bookKeys/ticks
		const uniqueBookKeys = [
			...new Set([...orderMap.values()].map((o) => o.bookKey)),
		]
		const uniqueTicks = [...new Set([...orderMap.values()].map((o) => o.tick))]

		type Book = { base: Address; quote: Address }
		const bookMap = new Map<string, Book>()
		const tickPriceMap = new Map<number, bigint>()

		const [bookSettled, tickSettled] = await Promise.all([
			Promise.allSettled(
				uniqueBookKeys.map((key) =>
					client.readContract({
						address: DEX_ADDRESS,
						abi: Abis.stablecoinDex,
						functionName: 'books',
						args: [key],
					}),
				),
			),
			Promise.allSettled(
				uniqueTicks.map((tick) =>
					client.readContract({
						address: DEX_ADDRESS,
						abi: Abis.stablecoinDex,
						functionName: 'tickToPrice',
						args: [tick],
					}),
				),
			),
		])

		for (let i = 0; i < uniqueBookKeys.length; i++) {
			const res = bookSettled[i]
			const key = uniqueBookKeys[i]
			if (res?.status === 'fulfilled' && key)
				bookMap.set(key, { base: res.value.base, quote: res.value.quote })
		}

		for (let i = 0; i < uniqueTicks.length; i++) {
			const res = tickSettled[i]
			const tick = uniqueTicks[i]
			if (res?.status === 'fulfilled' && tick !== undefined)
				tickPriceMap.set(tick, BigInt(res.value))
		}

		// Phase 4: Get token decimals + block timestamps
		const tokenSet = new Set<Address>()
		for (const book of bookMap.values()) {
			tokenSet.add(book.base)
			tokenSet.add(book.quote)
		}
		const uniqueTokens = [...tokenSet]

		const uniqueBlockNumbers = [
			...new Set(filledLogs.map((l) => l.blockNumber)),
		]

		const [decimalSettled, ...blocks] = await Promise.all([
			Promise.allSettled(
				uniqueTokens.map((token) =>
					client.readContract({
						address: token,
						abi: Abis.tip20,
						functionName: 'decimals',
					}),
				),
			),
			...uniqueBlockNumbers.map((bn) => client.getBlock({ blockNumber: bn })),
		])

		const decimalsMap = new Map<string, number>()
		for (let i = 0; i < uniqueTokens.length; i++) {
			const res = decimalSettled[i]
			const token = uniqueTokens[i]
			if (res?.status === 'fulfilled' && token)
				decimalsMap.set(token.toLowerCase(), Number(res.value))
		}

		const blockTimestampMap = new Map<bigint, number>()
		for (let i = 0; i < uniqueBlockNumbers.length; i++) {
			const bn = uniqueBlockNumbers[i]
			const block = blocks[i]
			if (bn !== undefined && block)
				blockTimestampMap.set(bn, Number(block.timestamp))
		}

		// Phase 5: Get reserves per-block (end-of-block state)
		const perBlockReserves = await Promise.all(
			uniqueBlockNumbers.map(async (bn) => {
				const settled = await Promise.allSettled(
					uniqueTokens.map((token) =>
						client.readContract({
							address: token,
							abi: Abis.tip20,
							functionName: 'balanceOf',
							args: [DEX_ADDRESS],
							blockNumber: bn,
						}),
					),
				)
				const reserves = new Map<string, bigint>()
				for (let i = 0; i < uniqueTokens.length; i++) {
					const res = settled[i]
					const token = uniqueTokens[i]
					if (res?.status === 'fulfilled' && token)
						reserves.set(token.toLowerCase(), res.value)
				}
				return reserves
			}),
		)

		const blockReserveMap = new Map<bigint, Map<string, bigint>>()
		for (let i = 0; i < uniqueBlockNumbers.length; i++) {
			const bn = uniqueBlockNumbers[i]
			const reserves = perBlockReserves[i]
			if (bn !== undefined && reserves) blockReserveMap.set(bn, reserves)
		}

		// Phase 6: Assemble swap events
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

		for (const log of filledLogs) {
			const { orderId, taker, amountFilled } = log.args
			if (!orderId || !taker || amountFilled === undefined) continue
			if (log.transactionIndex === null || log.logIndex === null) continue

			const blockTimestamp = blockTimestampMap.get(log.blockNumber)
			if (blockTimestamp === undefined) continue

			const order = orderMap.get(orderId.toString())
			if (!order) continue

			const book = bookMap.get(order.bookKey)
			if (!book) continue

			const baseDecimals = decimalsMap.get(book.base.toLowerCase())
			const quoteDecimals = decimalsMap.get(book.quote.toLowerCase())
			if (baseDecimals === undefined || quoteDecimals === undefined) continue

			const tickPrice = tickPriceMap.get(order.tick)
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

			const blockReserves = blockReserveMap.get(log.blockNumber)
			const baseReserve = blockReserves?.get(book.base.toLowerCase()) ?? 0n
			const quoteReserve = blockReserves?.get(book.quote.toLowerCase()) ?? 0n

			const baseDecNum = Number.parseFloat(baseAmountDec)
			const priceNative =
				baseDecNum > 0
					? (Number.parseFloat(quoteAmountDec) / baseDecNum).toPrecision(18)
					: '0'

			events.push({
				block: {
					blockNumber: Number(log.blockNumber),
					blockTimestamp,
				},
				eventType: 'swap',
				txnId: log.transactionHash,
				txnIndex: log.transactionIndex,
				eventIndex: log.logIndex,
				maker: taker,
				pairId: order.bookKey,
				...(asset0In !== undefined && { asset0In }),
				...(asset1In !== undefined && { asset1In }),
				...(asset0Out !== undefined && { asset0Out }),
				...(asset1Out !== undefined && { asset1Out }),
				priceNative,
				reserves: {
					asset0: formatUnits(baseReserve, baseDecimals),
					asset1: formatUnits(quoteReserve, quoteDecimals),
				},
			})
		}

		events.sort((a, b) => {
			if (a.block.blockNumber !== b.block.blockNumber)
				return a.block.blockNumber - b.block.blockNumber
			if (a.txnIndex !== b.txnIndex) return a.txnIndex - b.txnIndex
			return a.eventIndex - b.eventIndex
		})

		return context.json({ events })
	},
)

export { geckoApp }
