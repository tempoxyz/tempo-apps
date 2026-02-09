/**
 * Integration test for the GeckoTerminal API endpoints.
 *
 * Simulates exactly how GeckoTerminal polls:
 *   1. GET /gecko/latest-block
 *   2. GET /gecko/events?fromBlock=X&toBlock=Y
 *   3. For each new pairId → GET /gecko/pair?id=<pairId>
 *   4. For each new assetId → GET /gecko/asset?id=<assetId>
 *
 * Usage:
 *   npx tsx src/test.gecko.ts                          # single pass
 *   npx tsx src/test.gecko.ts --continuous              # poll every 2s like GeckoTerminal
 *   npx tsx src/test.gecko.ts --continuous --interval 5 # poll every 5s
 *   npx tsx src/test.gecko.ts --base-url http://localhost:6969
 */

const BASE_URL = getArg('--base-url') ?? 'http://localhost:6969'
const CONTINUOUS = process.argv.includes('--continuous')
const INTERVAL_S = Number(getArg('--interval') ?? '2')
const CHAIN_ID = getArg('--chain-id') ?? '4217'
const LOOKBACK = Number(getArg('--lookback') ?? '100')

function getArg(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag)
	return idx !== -1 ? process.argv[idx + 1] : undefined
}

// ---------------------------------------------------------------------------
// Types matching GeckoTerminal spec
// ---------------------------------------------------------------------------
interface Block {
	blockNumber: number
	blockTimestamp: number
}

interface LatestBlockResponse {
	block: Block
}

interface Asset {
	id: string
	name: string
	symbol: string
	decimals: number
	totalSupply?: string | number
}

interface AssetResponse {
	asset: Asset
}

interface Pair {
	id: string
	dexKey: string
	asset0Id: string
	asset1Id: string
	createdAtBlockNumber?: number
	createdAtBlockTimestamp?: number
	createdAtTxnId?: string
}

interface PairResponse {
	pair: Pair
}

interface SwapEvent {
	block: Block
	eventType: 'swap'
	txnId: string
	txnIndex: number
	eventIndex: number
	maker: string
	pairId: string
	asset0In?: string | number
	asset1In?: string | number
	asset0Out?: string | number
	asset1Out?: string | number
	priceNative: string | number
	reserves: { asset0: string | number; asset1: string | number }
}

interface EventsResponse {
	events: SwapEvent[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchJson<T>(path: string): Promise<{ data: T; ms: number }> {
	const url = `${BASE_URL}${path}`
	const start = performance.now()
	const res = await fetch(url)
	const ms = performance.now() - start

	if (!res.ok) {
		const text = await res.text().catch(() => '')
		throw new Error(`${res.status} ${res.statusText} — ${url}\n${text}`)
	}
	const data = (await res.json()) as T
	return { data, ms }
}

function assert(condition: boolean, msg: string) {
	if (!condition) {
		console.error(`  ✗ FAIL: ${msg}`)
		failures++
	} else {
		console.log(`  ✓ ${msg}`)
	}
}

let failures = 0
let totalRequests = 0
let totalMs = 0

function logTiming(label: string, ms: number) {
	totalRequests++
	totalMs += ms
	const color = ms < 500 ? '\x1b[32m' : ms < 2000 ? '\x1b[33m' : '\x1b[31m'
	console.log(`  ${color}${ms.toFixed(0)}ms\x1b[0m ${label}`)
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
function validateBlock(block: Block, label: string) {
	assert(
		typeof block.blockNumber === 'number' && block.blockNumber > 0,
		`${label}.blockNumber > 0`,
	)
	assert(
		typeof block.blockTimestamp === 'number' && block.blockTimestamp > 0,
		`${label}.blockTimestamp > 0`,
	)
}

function validateAsset(asset: Asset) {
	assert(
		typeof asset.id === 'string' && asset.id.startsWith('0x'),
		'asset.id is checksummed address',
	)
	assert(
		typeof asset.name === 'string' && asset.name.length > 0,
		'asset.name is non-empty',
	)
	assert(
		typeof asset.symbol === 'string' && asset.symbol.length > 0,
		'asset.symbol is non-empty',
	)
	assert(
		typeof asset.decimals === 'number' && asset.decimals >= 0,
		'asset.decimals >= 0',
	)
	if (asset.totalSupply !== undefined) {
		const val = Number(asset.totalSupply)
		assert(!Number.isNaN(val), 'asset.totalSupply is numeric')
	}
}

function validatePair(pair: Pair) {
	assert(
		typeof pair.id === 'string' && pair.id.length > 0,
		'pair.id is non-empty',
	)
	assert(
		typeof pair.dexKey === 'string' && pair.dexKey.length > 0,
		'pair.dexKey is non-empty',
	)
	assert(
		typeof pair.asset0Id === 'string' && pair.asset0Id.startsWith('0x'),
		'pair.asset0Id is address',
	)
	assert(
		typeof pair.asset1Id === 'string' && pair.asset1Id.startsWith('0x'),
		'pair.asset1Id is address',
	)
}

function validateSwapEvent(event: SwapEvent) {
	validateBlock(event.block, 'event.block')
	assert(event.eventType === 'swap', 'eventType === "swap"')
	assert(
		typeof event.txnId === 'string' && event.txnId.startsWith('0x'),
		'txnId is hex',
	)
	assert(typeof event.txnIndex === 'number', 'txnIndex is number')
	assert(typeof event.eventIndex === 'number', 'eventIndex is number')
	assert(
		typeof event.maker === 'string' && event.maker.startsWith('0x'),
		'maker is address',
	)
	assert(typeof event.pairId === 'string', 'pairId is string')

	const hasIn = event.asset0In !== undefined || event.asset1In !== undefined
	const hasOut = event.asset0Out !== undefined || event.asset1Out !== undefined
	assert(hasIn && hasOut, 'has at least one assetIn and one assetOut')

	const price = Number(event.priceNative)
	assert(
		!Number.isNaN(price) && price > 0,
		`priceNative > 0 (got ${event.priceNative})`,
	)

	assert(event.reserves !== undefined, 'reserves present')
	assert(Number(event.reserves.asset0) >= 0, 'reserves.asset0 >= 0')
	assert(Number(event.reserves.asset1) >= 0, 'reserves.asset1 >= 0')
}

function validateEventOrdering(events: SwapEvent[]) {
	for (let i = 1; i < events.length; i++) {
		const prev = events[i - 1]
		const curr = events[i]
		if (!prev || !curr) continue
		const ordered =
			curr.block.blockNumber > prev.block.blockNumber ||
			(curr.block.blockNumber === prev.block.blockNumber &&
				curr.txnIndex > prev.txnIndex) ||
			(curr.block.blockNumber === prev.block.blockNumber &&
				curr.txnIndex === prev.txnIndex &&
				curr.eventIndex > prev.eventIndex)
		assert(ordered, `events[${i}] ordered after events[${i - 1}]`)
	}
}

function validateEventUniqueness(events: SwapEvent[]) {
	const keys = new Set<string>()
	for (const e of events) {
		const key = `${e.block.blockNumber}:${e.txnIndex}:${e.eventIndex}`
		assert(!keys.has(key), `unique (block,txnIndex,eventIndex): ${key}`)
		keys.add(key)
	}
}

// ---------------------------------------------------------------------------
// Test flow
// ---------------------------------------------------------------------------
async function runOnce(
	lastSyncedBlock: number,
	seenPairs: Set<string>,
	seenAssets: Set<string>,
): Promise<{
	latestBlock: number
	pairIds: Set<string>
	assetIds: Set<string>
}> {
	const pairIds = new Set<string>()
	const assetIds = new Set<string>()

	// Step 1: GET /gecko/latest-block
	console.log('\n--- /gecko/latest-block ---')
	const { data: latestBlockRes, ms: latestMs } =
		await fetchJson<LatestBlockResponse>(
			`/gecko/latest-block?chainId=${CHAIN_ID}`,
		)
	logTiming('GET /gecko/latest-block', latestMs)
	validateBlock(latestBlockRes.block, 'latestBlock')
	const latestBlock = latestBlockRes.block.blockNumber

	// Step 2: GET /gecko/events?fromBlock=&toBlock=
	const fromBlock =
		lastSyncedBlock > 0 ? lastSyncedBlock : Math.max(1, latestBlock - LOOKBACK)
	const toBlock = latestBlock

	console.log(
		`\n--- /gecko/events?fromBlock=${fromBlock}&toBlock=${toBlock} (${toBlock - fromBlock + 1} blocks) ---`,
	)
	const { data: eventsRes, ms: eventsMs } = await fetchJson<EventsResponse>(
		`/gecko/events?fromBlock=${fromBlock}&toBlock=${toBlock}&chainId=${CHAIN_ID}`,
	)
	logTiming(`GET /gecko/events (${eventsRes.events.length} events)`, eventsMs)

	if (eventsRes.events.length > 0) {
		console.log(`\n  Validating ${eventsRes.events.length} events...`)
		for (const event of eventsRes.events) {
			validateSwapEvent(event)
			pairIds.add(event.pairId)
		}
		validateEventOrdering(eventsRes.events)
		validateEventUniqueness(eventsRes.events)

		const first = eventsRes.events[0]
		const last = eventsRes.events.at(-1)
		if (first && last) {
			console.log(
				`  blocks: ${first.block.blockNumber}..${last.block.blockNumber}`,
			)
			console.log(`  sample priceNative: ${first.priceNative}`)
		}
	} else {
		console.log('  (no events in range)')
	}

	// Step 3: For each new pair → GET /gecko/pair
	for (const pairId of pairIds) {
		if (seenPairs.has(pairId)) continue
		console.log(`\n--- /gecko/pair?id=${pairId.slice(0, 18)}... ---`)
		const { data: pairRes, ms: pairMs } = await fetchJson<PairResponse>(
			`/gecko/pair?id=${pairId}&chainId=${CHAIN_ID}`,
		)
		logTiming('GET /gecko/pair', pairMs)
		validatePair(pairRes.pair)
		assetIds.add(pairRes.pair.asset0Id)
		assetIds.add(pairRes.pair.asset1Id)
	}

	// Step 4: For each new asset → GET /gecko/asset
	for (const assetId of assetIds) {
		if (seenAssets.has(assetId)) continue
		console.log(`\n--- /gecko/asset?id=${assetId} ---`)
		const { data: assetRes, ms: assetMs } = await fetchJson<AssetResponse>(
			`/gecko/asset?id=${assetId}&chainId=${CHAIN_ID}`,
		)
		logTiming('GET /gecko/asset', assetMs)
		validateAsset(assetRes.asset)
	}

	return { latestBlock, pairIds, assetIds }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	console.log(`\x1b[1mGeckoTerminal Integration Test\x1b[0m`)
	console.log(`  base-url:   ${BASE_URL}`)
	console.log(`  chain-id:   ${CHAIN_ID}`)
	console.log(
		`  mode:       ${CONTINUOUS ? `continuous (${INTERVAL_S}s interval)` : 'single pass'}`,
	)
	console.log(`  lookback:   ${LOOKBACK} blocks`)

	const seenPairs = new Set<string>()
	const seenAssets = new Set<string>()
	let lastSyncedBlock = 0
	let iteration = 0

	const run = async () => {
		iteration++
		if (CONTINUOUS) {
			console.log(`\n${'='.repeat(60)}`)
			console.log(
				`Iteration ${iteration} | last synced: ${lastSyncedBlock || '(initial)'}`,
			)
			console.log(`${'='.repeat(60)}`)
		}

		const iterStart = performance.now()
		const { latestBlock, pairIds, assetIds } = await runOnce(lastSyncedBlock, seenPairs, seenAssets)
		const iterMs = performance.now() - iterStart

		for (const p of pairIds) seenPairs.add(p)
		for (const a of assetIds) seenAssets.add(a)
		lastSyncedBlock = latestBlock

		console.log(`\n--- Summary ---`)
		console.log(`  iteration:    ${iteration}`)
		console.log(`  total time:   ${iterMs.toFixed(0)}ms`)
		console.log(`  requests:     ${totalRequests}`)
		console.log(
			`  avg latency:  ${totalRequests > 0 ? (totalMs / totalRequests).toFixed(0) : 0}ms`,
		)
		console.log(`  pairs seen:   ${seenPairs.size}`)
		console.log(`  assets seen:  ${seenAssets.size}`)
		console.log(`  failures:     ${failures}`)
	}

	if (CONTINUOUS) {
		// First run with lookback, subsequent runs poll from last synced
		await run()
		const loop = async () => {
			while (true) {
				await new Promise((r) => setTimeout(r, INTERVAL_S * 1000))
				try {
					await run()
				} catch (err) {
					console.error(
						`\n\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : err}`,
					)
				}
			}
		}
		await loop()
	} else {
		await run()
		if (failures > 0) {
			console.error(`\n\x1b[31m${failures} assertion(s) failed\x1b[0m`)
			process.exit(1)
		} else {
			console.log(`\n\x1b[32mAll checks passed\x1b[0m`)
		}
	}
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
