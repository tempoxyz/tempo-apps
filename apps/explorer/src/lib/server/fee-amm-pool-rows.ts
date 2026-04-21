import type { Address, Hex } from 'ox'
import * as OxHash from 'ox/Hash'
import { env } from 'cloudflare:workers'
import { Tidx } from 'tidx.ts'
import { encodeAbiParameters } from 'viem'
import { Addresses } from 'viem/tempo'
import type { FeeAmmPoolRow } from '#lib/server/fee-amm'
import { fetchLatestBlockNumber } from '#lib/server/tempo-queries'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { parseTimestamp } from '#lib/timestamp'

const QB = tempoQueryBuilder

const FEE_AMM_MINT_EVENT_SIGNATURE =
	'event Mint(address sender, address indexed to, address indexed userToken, address indexed validatorToken, uint256 amountValidatorToken, uint256 liquidity)'
const LEGACY_FEE_AMM_MINT_EVENT_SIGNATURE =
	'event Mint(address indexed sender, address indexed userToken, address indexed validatorToken, uint256 amountUserToken, uint256 amountValidatorToken, uint256 liquidity)'

type FeeAmmMintRow = {
	userToken: Address.Address
	validatorToken: Address.Address
	tx_hash: Hex.Hex
	block_timestamp: string | number | bigint | null
	block_num: bigint
	log_idx: number
}

const FEE_AMM_QUERY_PAGE_SIZE = 500
const FEE_AMM_QUERY_BLOCK_RANGE = 1_000n
const TIDX_SERVER_ROW_LIMIT = 10_000
const POOLS_CACHE_TTL = 5 * 60_000
const FEE_AMM_POOLS_CACHE_KEY_PREFIX = 'fee-amm-pools:'

type FeeAmmPoolsCacheEntry = {
	rows: FeeAmmPoolRow[]
	ts: number
	scannedThroughBlockExclusive: bigint
}

type FeeAmmPoolsKvState = {
	lastBlock: string
	pools: FeeAmmPoolRow[]
}

const feeAmmPoolsCache = new Map<number, FeeAmmPoolsCacheEntry>()

export function clearFeeAmmPoolRowsCache(): void {
	feeAmmPoolsCache.clear()
}

function getFeeAmmPoolsKvNamespace(): KVNamespace | null {
	const bindings = env as Cloudflare.Env & {
		EXPLORER_FEE_AMM_CACHE?: KVNamespace | undefined
	}

	return bindings.EXPLORER_FEE_AMM_CACHE ?? null
}

function getFeeAmmPoolsCacheKey(chainId: number): string {
	return `${FEE_AMM_POOLS_CACHE_KEY_PREFIX}${chainId}`
}

function createFeeAmmPoolsCacheEntry(
	rows: FeeAmmPoolRow[],
	ts: number,
	scannedThroughBlockExclusive: bigint,
): FeeAmmPoolsCacheEntry {
	return {
		rows,
		ts,
		scannedThroughBlockExclusive,
	}
}

async function readFeeAmmPoolsKvState(
	chainId: number,
): Promise<FeeAmmPoolsCacheEntry | null> {
	const namespace = getFeeAmmPoolsKvNamespace()
	if (!namespace) return null

	try {
		const cached = await namespace.get<FeeAmmPoolsKvState>(
			getFeeAmmPoolsCacheKey(chainId),
			'json',
		)
		if (!cached) return null

		return createFeeAmmPoolsCacheEntry(
			cached.pools,
			0,
			BigInt(cached.lastBlock) + 1n,
		)
	} catch (error) {
		console.error('[fee-amm] Failed to read pools cache from KV:', error)
		return null
	}
}

async function writeFeeAmmPoolsKvState(
	chainId: number,
	lastBlock: bigint,
	rows: FeeAmmPoolRow[],
): Promise<void> {
	const namespace = getFeeAmmPoolsKvNamespace()
	if (!namespace) return

	try {
		const state: FeeAmmPoolsKvState = {
			lastBlock: lastBlock.toString(),
			pools: rows,
		}
		await namespace.put(getFeeAmmPoolsCacheKey(chainId), JSON.stringify(state))
	} catch (error) {
		console.error('[fee-amm] Failed to write pools cache to KV:', error)
	}
}

function getFeeAmmPoolKey(
	userToken: Address.Address,
	validatorToken: Address.Address,
): string {
	return `${userToken.toLowerCase()}:${validatorToken.toLowerCase()}`
}

function mergeFeeAmmPoolRows(
	existingRows: FeeAmmPoolRow[],
	mintRows: FeeAmmMintRow[],
): FeeAmmPoolRow[] {
	const pools = new Map<string, FeeAmmPoolRow>(
		existingRows.map((row) => [
			getFeeAmmPoolKey(row.userToken, row.validatorToken),
			{ ...row },
		]),
	)

	for (const row of mintRows) {
		const userToken = row.userToken
		const validatorToken = row.validatorToken
		const key = getFeeAmmPoolKey(userToken, validatorToken)
		const timestamp = parseTimestamp(row.block_timestamp)

		const existing = pools.get(key)
		if (!existing) {
			pools.set(key, {
				poolId: OxHash.keccak256(
					encodeAbiParameters(
						[{ type: 'address' }, { type: 'address' }],
						[userToken, validatorToken],
					),
				),
				userToken,
				validatorToken,
				createdAt: timestamp ?? null,
				createdTxHash: row.tx_hash,
				latestMintAt: timestamp ?? null,
				latestMintTxHash: row.tx_hash,
				mintCount: 1,
			})
			continue
		}

		existing.latestMintAt = timestamp ?? null
		existing.latestMintTxHash = row.tx_hash
		existing.mintCount += 1
	}

	return Array.from(pools.values())
}

function createFeeAmmMintQuery(chainId: number) {
	return QB(chainId)
		.withSignatures([
			FEE_AMM_MINT_EVENT_SIGNATURE,
			LEGACY_FEE_AMM_MINT_EVENT_SIGNATURE,
		])
		.selectFrom('mint')
		.select([
			'userToken',
			'validatorToken',
			'tx_hash',
			'block_timestamp',
			'block_num',
			'log_idx',
		])
		.where('address', '=', Addresses.feeManager)
}

async function fetchFeeAmmMintRowsForBlock(
	chainId: number,
	blockNumber: bigint,
): Promise<FeeAmmMintRow[]> {
	const rows: FeeAmmMintRow[] = []
	let lastLogIndex: number | null = null

	while (true) {
		let query = createFeeAmmMintQuery(chainId)
			.where('block_num', '=', blockNumber)
			.orderBy('log_idx', 'asc')
			.limit(FEE_AMM_QUERY_PAGE_SIZE)

		if (lastLogIndex != null) {
			query = query.where('log_idx', '>', lastLogIndex)
		}

		const page = (await query.execute()) as FeeAmmMintRow[]
		rows.push(...page)

		if (page.length < FEE_AMM_QUERY_PAGE_SIZE) {
			return rows
		}

		lastLogIndex = page[page.length - 1]?.log_idx ?? lastLogIndex
	}
}

async function fetchFeeAmmMintRowsForBlockRange(
	chainId: number,
	startBlock: bigint,
	endBlockExclusive: bigint,
): Promise<FeeAmmMintRow[]> {
	if (startBlock >= endBlockExclusive) return []

	try {
		const rows = (await createFeeAmmMintQuery(chainId)
			.where('block_num', '>=', startBlock)
			.where('block_num', '<', endBlockExclusive)
			.orderBy('block_num', 'asc')
			.orderBy('log_idx', 'asc')
			.execute()) as FeeAmmMintRow[]

		if (
			rows.length >= TIDX_SERVER_ROW_LIMIT &&
			endBlockExclusive - startBlock > 1n
		) {
			const midpoint = startBlock + (endBlockExclusive - startBlock) / 2n
			const leftRows = await fetchFeeAmmMintRowsForBlockRange(
				chainId,
				startBlock,
				midpoint,
			)
			const rightRows = await fetchFeeAmmMintRowsForBlockRange(
				chainId,
				midpoint,
				endBlockExclusive,
			)

			return [...leftRows, ...rightRows]
		}

		return rows
	} catch (error) {
		if (
			!(
				error instanceof Tidx.FetchRequestError &&
				(error.status === 422 || error.status === 504)
			)
		) {
			throw error
		}

		if (endBlockExclusive - startBlock <= 1n) {
			return fetchFeeAmmMintRowsForBlock(chainId, startBlock)
		}

		const midpoint = startBlock + (endBlockExclusive - startBlock) / 2n
		const leftRows = await fetchFeeAmmMintRowsForBlockRange(
			chainId,
			startBlock,
			midpoint,
		)
		const rightRows = await fetchFeeAmmMintRowsForBlockRange(
			chainId,
			midpoint,
			endBlockExclusive,
		)

		return [...leftRows, ...rightRows]
	}
}

export async function fetchFeeAmmPoolRows(
	chainId: number,
): Promise<FeeAmmPoolRow[]> {
	const now = Date.now()
	const inMemoryCached = feeAmmPoolsCache.get(chainId)
	if (inMemoryCached && now - inMemoryCached.ts < POOLS_CACHE_TTL) {
		return inMemoryCached.rows
	}

	const kvCached = await readFeeAmmPoolsKvState(chainId)
	const cached = (() => {
		if (!inMemoryCached) return kvCached
		if (!kvCached) return inMemoryCached
		return inMemoryCached.scannedThroughBlockExclusive >=
			kvCached.scannedThroughBlockExclusive
			? inMemoryCached
			: kvCached
	})()

	const latestBlockNumber = await fetchLatestBlockNumber(chainId)
	const scannedThroughBlockExclusive = latestBlockNumber + 1n

	if (
		cached &&
		cached.scannedThroughBlockExclusive >= scannedThroughBlockExclusive
	) {
		feeAmmPoolsCache.set(
			chainId,
			createFeeAmmPoolsCacheEntry(
				cached.rows,
				now,
				cached.scannedThroughBlockExclusive,
			),
		)
		return cached.rows
	}

	let discoveredRows = cached?.rows ?? []
	for (
		let startBlock = cached?.scannedThroughBlockExclusive ?? 0n;
		startBlock < scannedThroughBlockExclusive;
		startBlock += FEE_AMM_QUERY_BLOCK_RANGE
	) {
		const endBlockExclusive =
			startBlock + FEE_AMM_QUERY_BLOCK_RANGE < scannedThroughBlockExclusive
				? startBlock + FEE_AMM_QUERY_BLOCK_RANGE
				: scannedThroughBlockExclusive
		const mintRows = await fetchFeeAmmMintRowsForBlockRange(
			chainId,
			startBlock,
			endBlockExclusive,
		)

		if (mintRows.length === 0) continue

		discoveredRows = mergeFeeAmmPoolRows(discoveredRows, mintRows)
	}

	feeAmmPoolsCache.set(
		chainId,
		createFeeAmmPoolsCacheEntry(
			discoveredRows,
			now,
			scannedThroughBlockExclusive,
		),
	)
	await writeFeeAmmPoolsKvState(chainId, latestBlockNumber, discoveredRows)

	return discoveredRows
}
