import { Hono } from 'hono'

// Types
interface Env {
	SNAPSHOTS: R2Bucket
	R2_PUBLIC_URL: string
}

// Legacy metadata format (single archive per snapshot)
interface LegacyMetadata {
	chain_id: string
	block: number
	timestamp: string
	image?: string
	archive: string
}

// New manifest format (modular components)
interface SingleArchive {
	file: string
	size: number
}

interface ChunkedArchive {
	blocks_per_file: number
	total_blocks: number
	chunk_sizes: number[]
}

type ComponentManifest = SingleArchive | ChunkedArchive

function isSingleArchive(c: ComponentManifest): c is SingleArchive {
	return 'file' in c
}

interface SnapshotManifest {
	block: number
	chain_id: number
	storage_version: number
	timestamp: number
	base_url?: string
	reth_version?: string
	tempo_version?: string
	image?: string
	components: Record<string, ComponentManifest>
}

// Unified snapshot for the UI
interface Snapshot {
	snapshotId: string
	chainId: string
	networkKey: string
	networkName: string
	block: number
	timestamp: string
	date: string
	image: string
	archiveUrl: string
	archiveFile: string
	metadataUrl: string
	size: number
	isModular: boolean
	components?: SnapshotComponent[]
	manifestUrl?: string
	manifestKey?: string
	presetSizes?: PresetSizes
	rawManifest?: SnapshotManifest
}

interface SnapshotComponent {
	name: string
	displayName: string
	size: number
}

const COMPONENT_DISPLAY_NAMES: Record<string, string> = {
	state: 'State (mdbx)',
	headers: 'Headers',
	transactions: 'Transactions',
	transaction_senders: 'Senders',
	receipts: 'Receipts',
	account_changesets: 'Account Changesets',
	storage_changesets: 'Storage Changesets',
	rocksdb_indices: 'Indices',
}

interface NetworkInfo {
	chainId: string
	key: string
	name: string
}

const NETWORKS: Record<string, NetworkInfo> = {
	'4217': { chainId: '4217', key: 'mainnet', name: 'Mainnet' },
	'42431': { chainId: '42431', key: 'moderato', name: 'Moderato' },
}

const DEFAULT_CHAIN_ID = '4217'

interface ComponentSizes {
	state: number
	headers: number
	transactions: number
	transaction_senders: number
	receipts: number
	account_changesets: number
	storage_changesets: number
	rocksdb_indices: number
}

type PresetSizes = Record<'minimal' | 'full' | 'archive', ComponentSizes>

const PARIS_BLOCK = 15_537_394

type Distance =
	| { type: 'all' }
	| { type: 'none' }
	| { type: 'distance'; blocks: number }

function sizeForDistance(comp: ComponentManifest, dist: Distance): number {
	if (dist.type === 'none') return 0
	if (isSingleArchive(comp)) return dist.type === 'all' ? comp.size : 0
	const totalSize = comp.chunk_sizes.reduce((a, b) => a + b, 0)
	if (dist.type === 'all') return totalSize
	const neededChunks = Math.ceil(dist.blocks / comp.blocks_per_file)
	const chunks = comp.chunk_sizes
	if (neededChunks >= chunks.length) return totalSize
	let sum = 0
	for (let i = chunks.length - neededChunks; i < chunks.length; i++) {
		sum += chunks[i]
	}
	return sum
}

function getPresetDistances(
	snapshotBlock: number,
): Record<'minimal' | 'full' | 'archive', Record<string, Distance>> {
	const all: Distance = { type: 'all' }
	const none: Distance = { type: 'none' }
	const d = (blocks: number): Distance => ({ type: 'distance', blocks })

	const fullTxDistance =
		snapshotBlock >= PARIS_BLOCK ? d(snapshotBlock - PARIS_BLOCK + 1) : all

	return {
		archive: {
			state: all,
			headers: all,
			transactions: all,
			receipts: all,
			account_changesets: all,
			storage_changesets: all,
			transaction_senders: all,
			rocksdb_indices: all,
		},
		full: {
			state: all,
			headers: all,
			transactions: fullTxDistance,
			receipts: d(10064),
			account_changesets: d(10064),
			storage_changesets: d(10064),
			transaction_senders: none,
			rocksdb_indices: none,
		},
		minimal: {
			state: all,
			headers: all,
			transactions: d(10064),
			receipts: d(64),
			account_changesets: d(10064),
			storage_changesets: d(10064),
			transaction_senders: none,
			rocksdb_indices: none,
		},
	}
}

function getComponentSize(comp: ComponentManifest): number {
	if (isSingleArchive(comp)) return comp.size
	return comp.chunk_sizes.reduce((a, b) => a + b, 0)
}

function bytesToGB(bytes: number): number {
	if (bytes === 0) return 0
	return bytes / 1e9
}

function getPresetSizesFromManifest(manifest: SnapshotManifest): PresetSizes {
	const emptyComponentSizes = (): ComponentSizes => ({
		state: 0,
		headers: 0,
		transactions: 0,
		transaction_senders: 0,
		receipts: 0,
		account_changesets: 0,
		storage_changesets: 0,
		rocksdb_indices: 0,
	})

	const distances = getPresetDistances(manifest.block)
	const result: PresetSizes = {
		minimal: emptyComponentSizes(),
		full: emptyComponentSizes(),
		archive: emptyComponentSizes(),
	}

	for (const preset of ['minimal', 'full', 'archive'] as const) {
		for (const [name, comp] of Object.entries(manifest.components)) {
			const componentName = name as keyof ComponentSizes
			if (Object.hasOwn(result[preset], componentName)) {
				const dist = distances[preset][componentName] || { type: 'all' }
				result[preset][componentName] = bytesToGB(sizeForDistance(comp, dist))
			}
		}
	}

	return result
}

function safeJsonForInlineScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c')
}

function text(body: string): Response {
	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain;charset=utf-8',
		},
	})
}

function error(status: number, body: string): Response {
	return new Response(body, { status })
}

function getNetworkInfo(chainId: string): NetworkInfo {
	return (
		NETWORKS[chainId] || {
			chainId,
			key: `chain-${chainId}`,
			name: `Chain ${chainId}`,
		}
	)
}

function compareChainIds(a: string, b: string): number {
	const order = [DEFAULT_CHAIN_ID, '42431']
	const aIndex = order.indexOf(a)
	const bIndex = order.indexOf(b)

	if (aIndex !== -1 || bIndex !== -1) {
		if (aIndex === -1) return 1
		if (bIndex === -1) return -1
		return aIndex - bIndex
	}

	return Number(a) - Number(b)
}

const R2_MAX_RETRIES = 3
const R2_RETRY_BASE_DELAY_MS = 250

function isRetryableR2Error(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false

	const retryable = 'retryable' in err && err.retryable === true
	const message =
		'message' in err && typeof err.message === 'string' ? err.message : ''

	return retryable || /network connection lost/i.test(message)
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withR2Retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
	for (let attempt = 1; attempt <= R2_MAX_RETRIES; attempt++) {
		try {
			return await fn()
		} catch (err) {
			if (attempt === R2_MAX_RETRIES || !isRetryableR2Error(err)) {
				throw err
			}

			console.warn(
				`Transient R2 error during ${label}; retrying (${attempt + 1}/${R2_MAX_RETRIES})`,
			)
			await sleep(R2_RETRY_BASE_DELAY_MS * attempt)
		}
	}

	throw new Error(`Exhausted retries for ${label}`)
}

const app = new Hono<{ Bindings: Env }>()

app.get('/api/snapshots', (context) => handleAPI(context.req.raw, context.env))
app.get('/latest.txt', (context) => serveLatest({}, context.env))
app.get('/:chainId/latest.txt', (context) =>
	serveLatest({ chainId: context.req.param('chainId') }, context.env),
)
app.get('/:chainId/manifest.json', (context) =>
	serveManifest({ chainId: context.req.param('chainId') }, context.env),
)
app.get('/:chainId/:snapshotName', (context) =>
	serveSnapshot(
		{
			headers: context.req.raw.headers,
			snapshotName: context.req.param('snapshotName'),
		},
		context.env,
	),
)
app.get('/', (context) => handleUI(context.req.raw, context.env))

export default {
	fetch: app.fetch,
	scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(refreshSnapshotCaches(env))
	},
}

async function refreshSnapshotCaches(env: Env): Promise<void> {
	const snapshots = await getSnapshots(env)
	const cache = caches.default
	await populateSnapshotCaches(cache, snapshots)
	await cache.delete(new Request(CACHE_KEY_UI_HTML, { method: 'GET' }))
}

async function serveLatest(
	{ chainId = DEFAULT_CHAIN_ID }: { chainId?: string },
	env: Env,
): Promise<Response> {
	const snapshots = await getFullSnapshots(env)
	const latest = snapshots.find(
		(snapshot) => snapshot.chainId === chainId && !snapshot.isModular,
	)

	if (!latest) {
		return error(404, 'No non-modular snapshots found')
	}

	return text(latest.archiveFile)
}

async function serveManifest(
	{ chainId }: { chainId: string },
	env: Env,
): Promise<Response> {
	const snapshots = await getFullSnapshots(env)
	const latest = snapshots.find(
		(snapshot) =>
			snapshot.chainId === chainId &&
			snapshot.isModular &&
			snapshot.manifestKey,
	)

	if (!latest?.manifestKey) {
		return error(404, 'Manifest not found')
	}

	const key = latest.manifestKey
	const obj = await env.SNAPSHOTS.get(key)
	if (!obj) {
		return error(404, 'Manifest not found')
	}
	const body = await obj.text()
	return new Response(body, {
		headers: { 'Content-Type': 'application/json' },
	})
}

async function serveSnapshot(
	{ headers, snapshotName }: { snapshotName: string; headers: Headers },
	env: Env,
): Promise<Response> {
	const rangeHeader = headers.get('Range')

	const object = await env.SNAPSHOTS.get(snapshotName, {
		onlyIf: headers,
		range: headers,
	})

	if (object === null) {
		return error(404, 'Object Not Found')
	}

	const newHeaders = new Headers()
	object.writeHttpMetadata(newHeaders)
	newHeaders.set('etag', object.httpEtag)
	newHeaders.set('Accept-Ranges', 'bytes')

	// When no body is present, preconditions have failed
	if (!('body' in object)) {
		return new Response(undefined, { status: 412, headers: newHeaders })
	}

	// Handle range requests - R2 returns the range in object.range when a valid Range header was provided
	if (rangeHeader && object.range) {
		const range = object.range as { offset: number; length: number }
		const start = range.offset
		const end = range.offset + range.length - 1
		const total = object.size

		newHeaders.set('Content-Range', `bytes ${start}-${end}/${total}`)
		newHeaders.set('Content-Length', range.length.toString())

		return new Response(object.body, {
			status: 206,
			headers: newHeaders,
		})
	}

	// Full response
	newHeaders.set('Content-Length', object.size.toString())
	return new Response(object.body, {
		status: 200,
		headers: newHeaders,
	})
}

// List top-level directories and root objects using R2 delimiter (paginated)
async function listRoot(
	bucket: R2Bucket,
): Promise<{ dirs: string[]; objects: R2Object[] }> {
	const dirs: string[] = []
	const objects: R2Object[] = []
	let cursor: string | undefined
	while (true) {
		const res = await withR2Retry('listing root snapshot prefixes', () =>
			bucket.list({ cursor, delimiter: '/' }),
		)
		if (res.delimitedPrefixes) {
			dirs.push(...res.delimitedPrefixes)
		}
		objects.push(...res.objects)
		if (!res.truncated) break
		cursor = res.cursor
	}
	return { dirs, objects }
}

const SNAPSHOT_FETCH_CONCURRENCY = 8

async function mapWithConcurrency<T, U>(
	items: T[],
	limit: number,
	mapper: (item: T) => Promise<U>,
): Promise<U[]> {
	const results = new Array<U>(items.length)
	const entries = items.map((item, index) => ({ index, item }))
	let nextIndex = 0

	async function worker(): Promise<void> {
		while (nextIndex < entries.length) {
			const entry = entries[nextIndex]
			nextIndex += 1
			if (!entry) break
			results[entry.index] = await mapper(entry.item)
		}
	}

	const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
		worker(),
	)
	await Promise.all(workers)

	return results
}

function getComponentTerminalObjectKey(
	dirPrefix: string,
	name: string,
	comp: ComponentManifest,
): string {
	if (isSingleArchive(comp)) {
		return `${dirPrefix}/${comp.file}`
	}

	const numChunks = Math.ceil(comp.total_blocks / comp.blocks_per_file)
	const lastChunkIndex = Math.max(0, numChunks - 1)
	const start = lastChunkIndex * comp.blocks_per_file
	const end = (lastChunkIndex + 1) * comp.blocks_per_file - 1
	return `${dirPrefix}/${name}-${start}-${end}.tar.zst`
}

async function isManifestLikelyComplete(
	bucket: R2Bucket,
	manifest: SnapshotManifest,
	dirPrefix: string,
): Promise<boolean> {
	const terminalKeys = Object.entries(manifest.components).map(([name, comp]) =>
		getComponentTerminalObjectKey(dirPrefix, name, comp),
	)
	const heads = await Promise.all(
		terminalKeys.map((key) =>
			withR2Retry(`checking manifest component ${key}`, () => bucket.head(key)),
		),
	)

	return heads.every(Boolean)
}

// Fetch and parse all snapshots from R2
async function getSnapshots(env: Env): Promise<Snapshot[]> {
	// Step 1: List top-level directories and root files using delimiter (paginated)
	// This is O(dirs) instead of O(all_objects) — much faster
	const { dirs, objects: rootObjects } = await listRoot(env.SNAPSHOTS)

	// Step 2: Identify legacy metadata files at root level
	const legacyMetadataFiles = rootObjects.filter((obj) =>
		obj.key.endsWith('.json'),
	)

	// Fetch manifests in bounded parallelism. Keep this request path compact:
	// listing every chunk in every snapshot can exceed Worker CPU limits.
	const manifestResults = await mapWithConcurrency(
		dirs,
		SNAPSHOT_FETCH_CONCURRENCY,
		async (dir): Promise<Snapshot | null> => {
			const dirName = dir.replace(/\/$/, '')
			const manifestKey = `${dirName}/manifest.json`

			try {
				const obj = await withR2Retry(`fetching manifest ${manifestKey}`, () =>
					env.SNAPSHOTS.get(manifestKey),
				)
				if (!obj) return null

				const manifest: SnapshotManifest = await obj.json()

				if (
					!(await isManifestLikelyComplete(env.SNAPSHOTS, manifest, dirName))
				) {
					console.warn(`Skipping incomplete snapshot: ${manifestKey}`)
					return null
				}

				const chainId = String(manifest.chain_id)
				const network = getNetworkInfo(chainId)
				const baseUrl = `${env.R2_PUBLIC_URL}/${dirName}`

				const date = new Date(manifest.timestamp * 1000)
					.toISOString()
					.split('T')[0]

				const components: SnapshotComponent[] = []
				let totalSize = 0

				for (const [name, comp] of Object.entries(manifest.components)) {
					const displayName = COMPONENT_DISPLAY_NAMES[name] || name
					const size = getComponentSize(comp)
					components.push({ name, displayName, size })
					totalSize += size
				}

				const manifestUrl = `${baseUrl}/manifest.json`
				return {
					snapshotId: manifestUrl,
					chainId,
					networkKey: network.key,
					networkName: network.name,
					block: manifest.block,
					timestamp: String(manifest.timestamp),
					date,
					image:
						manifest.tempo_version ||
						manifest.reth_version ||
						manifest.image ||
						'unknown',
					archiveUrl: manifestUrl,
					archiveFile: manifestKey,
					metadataUrl: `${env.R2_PUBLIC_URL}/${manifestKey}`,
					size: totalSize,
					isModular: true,
					components,
					manifestUrl,
					manifestKey,
					presetSizes: getPresetSizesFromManifest(manifest),
				}
			} catch (err) {
				console.error(`Failed to parse manifest ${manifestKey}:`, err)
				return null
			}
		},
	)

	// Fetch legacy metadata in bounded parallelism.
	const legacyResults = await mapWithConcurrency(
		legacyMetadataFiles,
		SNAPSHOT_FETCH_CONCURRENCY,
		async (file): Promise<Snapshot | null> => {
			try {
				const obj = await withR2Retry(
					`fetching legacy metadata ${file.key}`,
					() => env.SNAPSHOTS.get(file.key),
				)
				if (!obj) return null

				const metadata: LegacyMetadata = await obj.json()
				const network = getNetworkInfo(metadata.chain_id)

				const archiveUrl = `${env.R2_PUBLIC_URL}/${metadata.archive}`
				const metadataUrl = `${env.R2_PUBLIC_URL}/${file.key}`

				const date = new Date(parseInt(metadata.timestamp, 10) * 1000)
					.toISOString()
					.split('T')[0]

				// Look up archive size — skip if archive is missing
				const archiveHead = await withR2Retry(
					`checking archive ${metadata.archive}`,
					() => env.SNAPSHOTS.head(metadata.archive),
				)
				if (!archiveHead) {
					console.warn(
						`Skipping legacy snapshot with missing archive: ${metadata.archive}`,
					)
					return null
				}
				const archiveSize = archiveHead.size

				return {
					snapshotId: metadataUrl,
					chainId: metadata.chain_id,
					networkKey: network.key,
					networkName: network.name,
					block: metadata.block,
					timestamp: metadata.timestamp,
					date,
					image: metadata.image || 'legacy',
					archiveUrl,
					archiveFile: metadata.archive,
					metadataUrl,
					size: archiveSize,
					isModular: false,
				}
			} catch (err) {
				console.error(`Failed to parse ${file.key}:`, err)
				return null
			}
		},
	)

	const snapshots = [
		...manifestResults.filter((s): s is Snapshot => s !== null),
		...legacyResults.filter((s): s is Snapshot => s !== null),
	]

	snapshots.sort(
		(a, b) => parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10),
	)

	return snapshots
}

const CACHE_KEY_FULL = 'https://snapshots.tempoxyz.dev/cache/v2/full'
const CACHE_KEY_API = 'https://snapshots.tempoxyz.dev/cache/v2/api'
const CACHE_KEY_UI_HTML = 'https://snapshots.tempoxyz.dev/cache/v2/ui-html'
const CACHE_TTL = 3600 // 1 hour — snapshots change at most once per day
let snapshotRefreshPromise: Promise<Snapshot[]> | undefined

// Strip UI-only fields from snapshots for API responses.
function stripSnapshotInternals(snapshots: Snapshot[]): Snapshot[] {
	return snapshots.map(({ presetSizes, rawManifest, ...rest }) => rest)
}

// Populate both caches from a fresh snapshot list
async function populateSnapshotCaches(
	cache: Cache,
	snapshots: Snapshot[],
): Promise<void> {
	const full = new Response(JSON.stringify(snapshots), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': `public, max-age=${CACHE_TTL}`,
		},
	})
	const stripped = new Response(
		JSON.stringify(stripSnapshotInternals(snapshots)),
		{
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `public, max-age=${CACHE_TTL}`,
			},
		},
	)
	await Promise.all([
		cache.put(CACHE_KEY_FULL, full),
		cache.put(CACHE_KEY_API, stripped),
	])
}

// Canonical source: returns UI snapshots with precomputed preset sizes.
async function getFullSnapshots(env: Env): Promise<Snapshot[]> {
	const cache = caches.default
	const cached = await cache.match(CACHE_KEY_FULL)
	if (cached) {
		return cached.json()
	}

	snapshotRefreshPromise ??= getSnapshots(env)
		.then(async (snapshots) => {
			await populateSnapshotCaches(cache, snapshots)
			return snapshots
		})
		.finally(() => {
			snapshotRefreshPromise = undefined
		})

	return snapshotRefreshPromise
}

// For UI rendering — alias for getFullSnapshots
async function getCachedSnapshotsForUI(env: Env): Promise<Snapshot[]> {
	return getFullSnapshots(env)
}

// Handle API requests — returns stripped snapshots without UI-only sizing data.
async function handleAPI(_req: Request, env: Env): Promise<Response> {
	const cache = caches.default
	const cached = await cache.match(CACHE_KEY_API)
	if (cached) {
		return new Response(cached.body, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `public, max-age=${CACHE_TTL}`,
			},
		})
	}

	// Populates both caches, return stripped
	const snapshots = await getFullSnapshots(env)
	const stripped = stripSnapshotInternals(snapshots)
	return new Response(JSON.stringify(stripped), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': `public, max-age=${CACHE_TTL}`,
		},
	})
}

// Serve HTML UI with server-side rendered data
async function handleUI(_req: Request, env: Env) {
	// Serve cached HTML from CF edge cache to avoid re-rendering
	const cache = caches.default
	const cacheKey = new Request(CACHE_KEY_UI_HTML, { method: 'GET' })
	const cachedHtml = await cache.match(cacheKey)
	if (cachedHtml) {
		return cachedHtml
	}

	const snapshots = await getCachedSnapshotsForUI(env)
	const defaultPresetSizes: PresetSizes = {
		minimal: {
			state: 0,
			headers: 0,
			transactions: 0,
			transaction_senders: 0,
			receipts: 0,
			account_changesets: 0,
			storage_changesets: 0,
			rocksdb_indices: 0,
		},
		full: {
			state: 0,
			headers: 0,
			transactions: 0,
			transaction_senders: 0,
			receipts: 0,
			account_changesets: 0,
			storage_changesets: 0,
			rocksdb_indices: 0,
		},
		archive: {
			state: 0,
			headers: 0,
			transactions: 0,
			transaction_senders: 0,
			receipts: 0,
			account_changesets: 0,
			storage_changesets: 0,
			rocksdb_indices: 0,
		},
	}
	const chainIds = [
		...new Set(snapshots.map((snapshot) => snapshot.chainId)),
	].sort(compareChainIds)
	const snapshotsByChain = Object.fromEntries(
		chainIds.map((chainId) => [
			chainId,
			snapshots.filter((snapshot) => snapshot.chainId === chainId),
		]),
	) as Record<string, Snapshot[]>
	const getSnapshotPresetSizes = (
		snapshot: Snapshot,
	): PresetSizes | undefined =>
		snapshot.presetSizes ||
		(snapshot.rawManifest
			? getPresetSizesFromManifest(snapshot.rawManifest)
			: undefined)
	const modularSnapshots = snapshots.filter(
		(s) => s.isModular && getSnapshotPresetSizes(s),
	)
	const modularSnapshotsByChain = Object.fromEntries(
		chainIds.map((chainId) => [
			chainId,
			modularSnapshots.filter((snapshot) => snapshot.chainId === chainId),
		]),
	) as Record<string, Snapshot[]>
	const snapshotPresetSizes: Record<string, PresetSizes> = {}
	for (const s of modularSnapshots) {
		snapshotPresetSizes[s.snapshotId] =
			getSnapshotPresetSizes(s) || defaultPresetSizes
	}
	const selectedChainId = chainIds.includes(DEFAULT_CHAIN_ID)
		? DEFAULT_CHAIN_ID
		: chainIds[0] || DEFAULT_CHAIN_ID
	const selectedNetworkSnapshots =
		modularSnapshotsByChain[selectedChainId] || []
	const latestModular = selectedNetworkSnapshots[0]
	const presetSizes = latestModular
		? snapshotPresetSizes[latestModular.snapshotId] || defaultPresetSizes
		: defaultPresetSizes
	const networkOptions = chainIds.map((chainId) => {
		const network = getNetworkInfo(chainId)
		const latestSnapshot = snapshotsByChain[chainId]?.[0]

		return {
			chainId,
			key: network.key,
			name: network.name,
			latestBlock: latestSnapshot?.block ?? null,
			latestTimestamp: latestSnapshot?.timestamp ?? null,
			hasModular: (modularSnapshotsByChain[chainId] || []).length > 0,
		}
	})
	const modularSnapshotOptionsByChain = Object.fromEntries(
		chainIds.map((chainId) => [
			chainId,
			(modularSnapshotsByChain[chainId] || []).map((snapshot) => ({
				snapshotId: snapshot.snapshotId,
				block: snapshot.block,
				timestamp: snapshot.timestamp,
				date: snapshot.date,
				image: snapshot.image,
				manifestUrl: snapshot.manifestUrl,
				networkName: snapshot.networkName,
			})),
		]),
	)
	const latestSnapshotsByChain = Object.fromEntries(
		chainIds.map((chainId) => {
			const latestSnapshot = snapshotsByChain[chainId]?.[0]

			return [
				chainId,
				latestSnapshot
					? {
							snapshotId: latestSnapshot.snapshotId,
							block: latestSnapshot.block,
							timestamp: latestSnapshot.timestamp,
							date: latestSnapshot.date,
							image: latestSnapshot.image,
							archiveUrl: latestSnapshot.archiveUrl,
							manifestUrl: latestSnapshot.manifestUrl || null,
							isModular: latestSnapshot.isModular,
							networkName: latestSnapshot.networkName,
						}
					: null,
			]
		}),
	)
	const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tempo Snapshots</title>
  <meta name="description" content="Configure your own node with our modular snapshots. Download individual components or full archives.">
  <meta property="og:title" content="Tempo Snapshots">
  <meta property="og:description" content="Configure your own node with our modular snapshots.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://snapshots.tempoxyz.dev">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Tempo Snapshots">
  <meta name="twitter:description" content="Configure your own node with our modular snapshots.">
  <link rel="icon" type="image/x-icon" href="https://tempo.xyz/favicon.ico">
  <meta property="og:image" content="https://tempo.xyz/favicon.ico">
  <meta name="twitter:image" content="https://tempo.xyz/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --tempo-50: oklch(0.97 0.01 250);
      --tempo-100: oklch(0.94 0.02 250);
      --tempo-200: oklch(0.88 0.04 250);
      --tempo-300: oklch(0.80 0.08 250);
      --tempo-400: oklch(0.70 0.12 250);
      --tempo-500: oklch(0.60 0.16 250);
      --tempo-600: oklch(0.50 0.16 250);
      --tempo-700: oklch(0.42 0.14 250);
      --tempo-800: oklch(0.35 0.12 250);
      --tempo-900: oklch(0.28 0.10 250);
      --tempo-950: oklch(0.18 0.06 250);
      --ease: cubic-bezier(0.22, 1, 0.36, 1);
      --duration: 250ms;
      --radius: 0;
    }

    :root, .light {
      --bg: #fff;
      --fg: #000;
      --muted: #666;
      --muted-bg: #f5f5f5;
      --border: #ddd;
      --accent: #000;
      --accent-dim: #333;
      --surface: #fff;
      --surface-hover: #f5f5f5;
      --th-bg: #f5f5f5;
      --row-border: #eee;
      --hero-glow-1: transparent;
      --hero-glow-2: transparent;
      --cmd-copy-hover-bg: #f0f0f0;
      --cmd-border: #ccc;
      --option-bg: #fff;
      --badge-chain-bg: #f0f0f0;
      --badge-chain-fg: #333;
      --badge-profile-bg: oklch(0.92 0.08 280);
      --badge-profile-fg: oklch(0.35 0.15 280);
      --badge-channel-bg: oklch(0.92 0.08 155);
      --badge-channel-fg: oklch(0.35 0.15 155);
      --badge-edge-bg: oklch(0.92 0.08 55);
      --badge-edge-fg: oklch(0.35 0.15 55);
      --btn-primary-bg: oklch(0.45 0.2 260);
      --btn-primary-hover: oklch(0.40 0.22 260);
      --size-fg: #333;
      --count-badge-fg: #fff;
      --disk-state:    oklch(0.50 0.25 260);
      --disk-headers:  oklch(0.55 0.25 290);
      --disk-txs:      oklch(0.60 0.22 155);
      --disk-tx-send:  oklch(0.62 0.20 140);
      --disk-receipts: oklch(0.65 0.22 80);
      --disk-acc-cs:   oklch(0.58 0.22 30);
      --disk-sto-cs:   oklch(0.55 0.22 330);
      --disk-indices:  oklch(0.50 0.20 200);
    }

    .dark {
      --bg: #050505;
      --fg: #f5f5f5;
      --muted: #9ca3af;
      --muted-bg: #111111;
      --border: #262626;
      --accent: #e5e5e5;
      --accent-dim: #404040;
      --surface: #0c0c0c;
      --surface-hover: #1a1a1a;
      --th-bg: #0a0a0a;
      --row-border: #1a1a1a;
      --hero-glow-1: oklch(0.35 0.10 260 / 0.20);
      --hero-glow-2: oklch(0.40 0.12 280 / 0.10);
      --cmd-copy-hover-bg: #1a1a1a;
      --cmd-border: #262626;
      --option-bg: #0a0a0a;
      --badge-chain-bg: #1a1a1a;
      --badge-chain-fg: #d4d4d4;
      --badge-profile-bg: oklch(0.22 0.04 300);
      --badge-profile-fg: oklch(0.82 0.10 300);
      --badge-channel-bg: oklch(0.22 0.04 155);
      --badge-channel-fg: oklch(0.82 0.12 155);
      --badge-edge-bg: oklch(0.22 0.04 55);
      --badge-edge-fg: oklch(0.82 0.12 55);
      --btn-primary-bg: #f5f5f5;
      --btn-primary-hover: #ffffff;
      --size-fg: #d4d4d4;
      --count-badge-fg: #050505;
      --disk-state:    oklch(0.60 0.20 260);
      --disk-headers:  oklch(0.65 0.18 290);
      --disk-txs:      oklch(0.72 0.17 165);
      --disk-tx-send:  oklch(0.68 0.15 150);
      --disk-receipts: oklch(0.75 0.16 85);
      --disk-acc-cs:   oklch(0.70 0.18 35);
      --disk-sto-cs:   oklch(0.65 0.18 340);
      --disk-indices:  oklch(0.60 0.15 210);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.6;
      min-height: 100vh;
    }

    .hero {
      position: relative;
      padding: 4rem 2rem 3rem;
      overflow: hidden;
    }

    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 60% at 50% -20%, var(--hero-glow-1), transparent),
        radial-gradient(ellipse 60% 40% at 80% 0%, var(--hero-glow-2), transparent);
      pointer-events: none;
    }

    .hero-inner {
      position: relative;
      max-width: 1400px;
      margin: 0 auto;
    }

    .hero h1 {
      font-size: 3rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.1;
      background: linear-gradient(135deg, var(--fg) 0%, var(--muted) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .hero-logo {
      width: 36px;
      height: 36px;
      -webkit-text-fill-color: initial;
    }

    .hero-sub {
      margin-top: 0.75rem;
      color: var(--muted);
      font-size: 1.1rem;
    }

    .cmd-box {
      margin-top: 1.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      background: var(--surface);
      border: 1px solid var(--cmd-border);
      border-radius: var(--radius);
      padding: 0.75rem 1.25rem;
      transition: border-color var(--duration) var(--ease);
    }

    .cmd-box:hover {
      border-color: var(--accent);
    }

    .cmd-box code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      color: var(--fg);
    }

    .cmd-box .cmd-prefix {
      color: var(--accent);
      user-select: none;
    }

    .dark .cmd-box code {
      color: #e5e5e5;
    }

    .cmd-copy {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 0;
      transition: color var(--duration) var(--ease), background var(--duration) var(--ease);
      display: flex;
      align-items: center;
    }

    .cmd-copy:hover {
      color: var(--accent);
      background: var(--cmd-copy-hover-bg);
    }

    .cmd-copy.copied { color: oklch(0.72 0.17 155); }

    .main {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 2rem 4rem;
    }

    .filters {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      align-items: end;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      flex: 1;
      min-width: 160px;
      max-width: 220px;
    }

    .filter-group label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    input, select {
      font-family: 'Inter', sans-serif;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 0.5rem 0.875rem;
      border-radius: 0;
      font-size: 0.875rem;
      transition: border-color var(--duration) var(--ease), box-shadow var(--duration) var(--ease);
      width: 100%;
    }

    .dark input[type="date"]::-webkit-calendar-picker-indicator {
      filter: invert(1);
    }

    .dark select {
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23aaa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    }

    input:focus, select:focus {
      outline: none;
      border-color: var(--accent-dim);
      box-shadow: 0 0 0 3px oklch(0.50 0.16 250 / 0.15);
    }

    select {
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
      background-repeat: no-repeat;
      background-position: right 0.5rem center;
      background-size: 1.25em;
      padding-right: 2.25rem;
    }

    select option {
      background: var(--option-bg);
      color: var(--fg);
    }

    .stats-bar {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--fg);
    }

    .stat-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .table-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.675rem;
      letter-spacing: 0.08em;
      color: var(--muted);
      background: var(--th-bg);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      white-space: nowrap;
    }

    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--row-border);
      font-size: 0.875rem;
      vertical-align: middle;
      white-space: nowrap;
    }

    tr:last-child td { border-bottom: none; }

    tr {
      transition: background var(--duration) var(--ease);
    }

    tr:hover td {
      background: var(--surface-hover);
    }

    .mono {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.5rem;
      border-radius: 0;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      font-family: 'JetBrains Mono', monospace;
    }

    .badge-chain {
      background: var(--badge-chain-bg);
      color: var(--badge-chain-fg);
    }

    .badge-profile {
      background: var(--badge-profile-bg);
      color: var(--badge-profile-fg);
    }

    .badge-channel {
      background: var(--badge-channel-bg);
      color: var(--badge-channel-fg);
    }

    .badge-edge {
      background: var(--badge-edge-bg);
      color: var(--badge-edge-fg);
    }

    .badge-green {
      background: oklch(0.92 0.08 155);
      color: oklch(0.35 0.15 155);
    }

    .dark .badge-green {
      background: oklch(0.22 0.06 155);
      color: oklch(0.80 0.12 155);
    }

    .badge-grey {
      background: #eee;
      color: #666;
    }

    .dark .badge-grey {
      background: #1a1a1a;
      color: #9ca3af;
    }

    .badge-blue {
      background: oklch(0.92 0.08 250);
      color: oklch(0.35 0.15 250);
    }

    .dark .badge-blue {
      background: oklch(0.22 0.04 250);
      color: oklch(0.80 0.12 250);
    }

    .badge-orange {
      background: oklch(0.92 0.08 55);
      color: oklch(0.35 0.15 55);
    }

    .dark .badge-orange {
      background: oklch(0.22 0.04 55);
      color: oklch(0.80 0.12 55);
    }

    .badge-purple {
      background: oklch(0.92 0.08 300);
      color: oklch(0.35 0.15 300);
    }

    .dark .badge-purple {
      background: oklch(0.22 0.04 300);
      color: oklch(0.80 0.12 300);
    }

    .badge-teal {
      background: oklch(0.92 0.08 185);
      color: oklch(0.35 0.15 185);
    }

    .dark .badge-teal {
      background: oklch(0.22 0.04 185);
      color: oklch(0.80 0.12 185);
    }

    .size-cell {
      font-variant-numeric: tabular-nums;
      color: var(--size-fg);
    }

    .actions {
      display: flex;
      gap: 0.375rem;
      white-space: nowrap;
      justify-content: flex-end;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.375rem 0.75rem;
      border-radius: 0;
      font-size: 0.8rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: none;
      font-family: 'Inter', sans-serif;
      transition: all var(--duration) var(--ease);
    }

    .btn-primary {
      background: var(--btn-primary-bg);
      color: white;
    }

    .dark .btn-primary {
      color: #050505;
    }

    .btn-primary:hover {
      background: var(--btn-primary-hover);
      color: white;
    }

    .dark .btn-primary:hover {
      color: #050505;
    }

    .btn-ghost {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
    }

    .btn-ghost:hover {
      background: var(--surface-hover);
      color: var(--fg);
      border-color: var(--tempo-700);
    }

    .btn-ghost.copied {
      color: oklch(0.72 0.17 155);
      border-color: oklch(0.50 0.12 155);
    }

    .image-trail {
      color: var(--muted);
      font-size: 0.75rem;
      display: inline-block;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: middle;
    }

    .loading {
      text-align: center;
      padding: 4rem;
      color: var(--muted);
    }

    .empty {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--muted);
    }

    .empty-icon {
      font-size: 2.5rem;
      margin-bottom: 0.75rem;
      opacity: 0.4;
    }

    .count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.5rem;
      padding: 0.125rem 0.5rem;
      border-radius: 0;
      background: var(--accent-dim);
      color: white;
      font-size: 0.75rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      margin-left: 0.5rem;
    }

    .table-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .table-title {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      display: flex;
      align-items: center;
    }

    @media (max-width: 768px) {
      .hero { padding: 2.5rem 1.25rem 2rem; }
      .hero h1 { font-size: 2rem; }
      .main { padding: 0 1.25rem 3rem; }
      .filters { gap: 0.5rem; }
      .filter-group { max-width: none; min-width: 140px; }
      .stats-bar { gap: 1rem; }
      .stat-value { font-size: 1.25rem; }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .fade-in {
      animation: fadeIn 0.5s var(--ease) both;
    }

    .tabs {
      display: flex;
      gap: 0.375rem;
      margin-bottom: 2rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0;
      padding: 0.25rem;
      width: fit-content;
    }

    .tab {
      padding: 0.5rem 1.25rem;
      border-radius: 0;
      border: none;
      background: transparent;
      color: var(--muted);
      font-family: 'Inter', sans-serif;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--duration) var(--ease);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .tab:hover {
      color: var(--fg);
    }

    .tab.active {
      background: var(--accent-dim);
      color: white;
    }

    .tab-badge {
      font-size: 0.6rem;
      font-weight: 700;
      padding: 0.1rem 0.375rem;
      border-radius: 0;
      background: oklch(0.72 0.17 155);
      color: white;
      letter-spacing: 0.03em;
    }

    .tab.active .tab-badge {
      background: oklch(0.85 0.15 155);
      color: oklch(0.25 0.08 155);
    }

    .snapshot-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.7rem;
      color: var(--muted);
      margin-bottom: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
    }

    .snapshot-indicator-reset {
      background: none;
      border: none;
      color: var(--accent);
      cursor: pointer;
      font-size: 0.7rem;
      padding: 0;
      text-decoration: underline;
      font-family: inherit;
    }

    .snapshot-status-note {
      margin-bottom: 1.5rem;
      font-size: 0.78rem;
      color: var(--muted);
      font-family: 'JetBrains Mono', monospace;
    }

    .cmd-toggle {
      display: flex;
      gap: 0;
      margin-bottom: 0.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
    }

    .cmd-toggle button {
      background: none;
      border: 1px solid var(--border);
      border-top: none;
      color: var(--muted);
      cursor: pointer;
      padding: 0.35rem 0.75rem;
      font-family: inherit;
      font-size: inherit;
    }

    .cmd-toggle button:first-child {
      border-right: none;
    }

    .cmd-toggle button.active {
      color: var(--fg);
      background: var(--surface);
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
      animation: fadeIn 0.3s var(--ease) both;
    }

    .presets {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      margin-bottom: 2.5rem;
      border: 1px solid var(--border);
    }

    .preset {
      padding: 1.5rem;
      cursor: pointer;
      border: none;
      background: var(--surface);
      text-align: left;
      font-family: 'Inter', sans-serif;
      transition: background var(--duration) var(--ease);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .preset:last-child {
      border-right: none;
    }

    .preset:hover {
      background: var(--surface-hover);
    }

    .preset:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .preset:disabled:hover {
      background: var(--surface);
    }

    .preset.active {
      background: var(--surface-hover);
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent);
    }

    .preset.modified {
      background: var(--surface-hover);
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent);
    }

    .preset.modified .preset-radio {
      border-color: var(--accent);
    }

    .preset.modified .preset-radio::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      background: var(--accent);
    }

    .preset-modified-tag {
      display: none;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-left: 0.375rem;
    }

    .preset.modified .preset-modified-tag {
      display: inline;
    }

    .preset-header {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }

    .preset-radio {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-radius: 50%;
      flex-shrink: 0;
      position: relative;
      transition: border-color var(--duration) var(--ease);
    }

    .preset.active .preset-radio {
      border-color: var(--accent);
    }

    .preset.active .preset-radio::after {
      content: '';
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      background: var(--accent);
    }

    .preset-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--fg);
      letter-spacing: -0.01em;
      flex: 1;
    }

    .preset-size {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--accent);
    }

    .preset-desc {
      font-size: 0.8rem;
      color: var(--muted);
      line-height: 1.5;
    }

    .preset-capability {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--fg);
    }

    .preset-ideal {
      font-size: 0.75rem;
      color: var(--muted);
      font-style: italic;
    }

    .disk-bar-section {
      margin-bottom: 2.5rem;
    }

    .disk-bar-label {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 0.625rem;
    }

    .disk-bar-title {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .disk-bar-total {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--fg);
    }

    .disk-bar {
      width: 100%;
      height: 40px;
      display: flex;
      overflow: visible;
      border: 1px solid var(--border);
    }

    .disk-segment {
      height: 100%;
      transition: width 0.4s var(--ease), opacity 0.3s var(--ease);
      position: relative;
    }

    .disk-segment.unchecked {
      opacity: 0.2;
    }

    .disk-segment-group {
      display: flex;
      height: 100%;
    }

    .disk-segment-group.highlight {
      outline: 2px solid var(--fg);
      outline-offset: 1px;
      z-index: 1;
    }

    .disk-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-top: 0.75rem;
    }

    .disk-legend-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      color: var(--muted);
      padding: 0.4rem 0.375rem 0.2rem;
      border-bottom: 1px solid transparent;
      cursor: default;
    }

    .disk-legend-item.unchecked {
      opacity: 0.4;
    }

    .disk-legend-item.highlight {
      border-bottom: 1px solid var(--fg);
    }

    .disk-legend-swatch {
      width: 10px;
      height: 10px;
      flex-shrink: 0;
    }

    .disk-legend-item span {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
    }

    .disk-legend-size {
      opacity: 0.7;
    }

    .disk-note {
      font-size: 0.7rem;
      color: var(--muted);
      margin-top: 0.5rem;
      font-style: italic;
    }

    .checklist {
      border: 1px solid var(--border);
      margin-bottom: 2.5rem;
    }

    .checklist-row {
      display: grid;
      grid-template-columns: 2.5rem 1fr 1fr 1fr;
      align-items: center;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--row-border);
      transition: background var(--duration) var(--ease);
      cursor: pointer;
    }

    .checklist-row:last-child {
      border-bottom: none;
    }

    .checklist-row:hover {
      background: var(--surface-hover);
    }

    .checklist-row.checked {
      background: var(--surface);
    }

    .checklist-head {
      display: grid;
      grid-template-columns: 2.5rem 1fr 1fr 1fr;
      padding: 0.625rem 1rem;
      background: var(--th-bg);
      border-bottom: 1px solid var(--border);
      font-size: 0.675rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .checklist-check {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .checklist-check input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
      cursor: pointer;
    }

    .checklist-name {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: var(--fg);
      font-weight: 500;
    }

    .checklist-desc {
      font-size: 0.8rem;
      color: var(--muted);
    }

    .checklist-size-cell {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: var(--muted);
      text-align: right;
    }

    .checklist-row.disabled {
      opacity: 0.5;
      cursor: default;
    }

    .checklist-row.disabled .checklist-check input[type="checkbox"] {
      cursor: default;
    }

    .capabilities-section {
      margin-bottom: 2.5rem;
    }

    .capabilities-label {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 0.625rem;
    }

    .capabilities-items {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      min-height: 5.5rem;
      align-content: flex-start;
    }

    .cap-item {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      padding: 0.375rem 0.75rem;
      border: 1px solid var(--border);
      color: var(--fg);
      background: var(--surface);
    }

    .cap-item.cap-new {
      border-color: var(--accent);
      animation: capIn 0.3s var(--ease) both;
    }

    @keyframes capIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }

    .modular-cmd {
      border: 1px solid var(--border);
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      background: var(--surface);
      margin-bottom: 0.25rem;
    }

    .modular-cmd .cmd-prefix {
      color: var(--accent);
      user-select: none;
    }

    .modular-cmd code {
      color: var(--fg);
      font-family: inherit;
    }

    .modular-cmd .cmd-copy {
      margin-left: auto;
    }

    .disabled-panel {
      opacity: 0.45;
      pointer-events: none;
    }

    @media (max-width: 768px) {
      .presets {
        grid-template-columns: 1fr;
      }
      .preset {
        border-right: none;
        border-bottom: 1px solid var(--border);
      }
      .preset:last-child {
        border-bottom: none;
      }
      .checklist-row, .checklist-head {
        grid-template-columns: 2.5rem 1fr 1fr;
      }
      .checklist-desc {
        display: none;
      }
    }

    .theme-toggle {
      position: absolute;
      top: 0;
      right: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0;
      padding: 0.5rem;
      cursor: pointer;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color var(--duration) var(--ease), border-color var(--duration) var(--ease), background var(--duration) var(--ease);
    }

    .theme-toggle:hover {
      color: var(--fg);
      border-color: var(--accent-dim);
    }

    .theme-toggle .icon-sun,
    .theme-toggle .icon-moon { display: none; }
    .dark .theme-toggle .icon-sun { display: block; }
    .dark .theme-toggle .icon-moon { display: none; }
    :not(.dark) .theme-toggle .icon-sun { display: none; }
    :not(.dark) .theme-toggle .icon-moon { display: block; }

    .footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      color: var(--muted);
      font-size: 0.8rem;
    }

    .footer a {
      color: var(--muted);
      text-decoration: none;
      transition: color var(--duration) var(--ease);
    }

    .footer a:hover {
      color: var(--fg);
    }

    .footer-sep {
      opacity: 0.4;
    }

    body { transition: background var(--duration) var(--ease), color var(--duration) var(--ease); }
    .hero::before { transition: background 0.4s var(--ease); }
    .table-card, .cmd-box, th, td, .table-header { transition: background var(--duration) var(--ease), border-color var(--duration) var(--ease), color var(--duration) var(--ease); }
    .badge { transition: background var(--duration) var(--ease), color var(--duration) var(--ease); }
  </style>
  <script>
    (function() {
      var saved = localStorage.getItem('theme');
      var dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (dark) document.documentElement.classList.add('dark');
    })();
  </script>
</head>
<body>
  <div class="hero">
    <div class="hero-inner fade-in">
      <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
        <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      </button>
      <h1><img src="https://tempo.xyz/favicon.ico" alt="Tempo" class="hero-logo">Tempo Snapshots</h1>
      <p class="hero-sub">Configure your own node with our modular snapshots.</p>
    </div>
  </div>

  <div class="main">
    <div class="fade-in" style="animation-delay: 0.1s">
      <div class="snapshot-indicator" id="snapshotIndicator" style="display:none">
        <span class="snapshot-indicator-text" id="snapshotIndicatorText"></span>
        <button class="snapshot-indicator-reset" id="snapshotIndicatorReset" onclick="configureSnapshot(latestModularSnapshotId)">Use latest</button>
      </div>

      <div class="filters">
        <div class="filter-group">
          <label for="networkSelect">Network</label>
          <select id="networkSelect"></select>
        </div>
        <div class="filter-group">
          <label for="snapshotSelect">Snapshot</label>
          <select id="snapshotSelect"></select>
        </div>
      </div>

      <div class="modular-cmd" id="modularCmd">
        <span class="cmd-prefix">$</span>
        <code id="modularCmdText">tempo download</code>
        <button class="cmd-copy" onclick="copyCmdText(this, document.getElementById('modularCmdText').textContent)" title="Copy command">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
      </div>

      <div class="cmd-toggle" id="cmdToggle" style="display:none">
        <button class="active" onclick="setCmdMode('command')">Command</button>
        <button onclick="setCmdMode('url')">Snapshot URL</button>
      </div>
      <div class="snapshot-status-note" id="snapshotStatusNote"></div>

      <div class="presets" id="presets">
        <button class="preset" id="preset-minimal" disabled>
          <div class="preset-header">
            <span class="preset-radio"></span>
            <span class="preset-name">Minimal<span class="preset-modified-tag">(modified)</span></span>
            <span class="preset-size" id="preset-minimal-size"></span>
          </div>
          <span class="preset-desc">State and headers with minimal history. Limited historical RPC.</span>
          <span class="preset-ideal">Ideal for validators and constrained environments</span>
        </button>
        <button class="preset" id="preset-full" disabled>
          <div class="preset-header">
            <span class="preset-radio"></span>
            <span class="preset-name">Full<span class="preset-modified-tag">(modified)</span></span>
            <span class="preset-size" id="preset-full-size"></span>
          </div>
          <span class="preset-desc">Full transaction history with recent receipts and state history.</span>
          <span class="preset-ideal">Ideal for dApp backends and personal nodes</span>
        </button>
        <button class="preset active" onclick="selectPreset('archive')" id="preset-archive">
          <div class="preset-header">
            <span class="preset-radio"></span>
            <span class="preset-name">Archive<span class="preset-modified-tag">(modified)</span></span>
            <span class="preset-size" id="preset-archive-size"></span>
          </div>
          <span class="preset-desc">Complete history. Includes all transactions, senders, and indices.</span>
          <span class="preset-ideal">Ideal for RPC providers, indexers, and researchers</span>
        </button>
      </div>

      <div class="disk-bar-section" id="diskBarSection">
        <div class="disk-bar-label">
          <span class="disk-bar-title">Estimated download size</span>
          <span class="disk-bar-total" id="diskTotal">~200 GB</span>
        </div>
        <div class="disk-bar" id="diskBar"></div>
        <div class="disk-legend" id="diskLegend"></div>
        <div class="disk-note">Download sizes are compressed. On-disk usage will be larger after extraction.</div>
      </div>

      <div class="capabilities-section" id="capabilitiesSection">
        <div class="capabilities-label">Unlocked capabilities</div>
        <div class="capabilities-items" id="capabilitiesItems"></div>
      </div>

      <div class="checklist" id="checklistSection">
        <div class="checklist-head">
          <span></span>
          <span>Component</span>
          <span>Description</span>
          <span style="text-align:right">Size</span>
        </div>
        <div id="checklistBody"></div>
      </div>

    </div>
  </div>

  <footer class="footer">
    <span id="footerStatus">Latest snapshot: block ${latestModular ? latestModular.block.toLocaleString() : '—'} · ${latestModular ? new Date(parseInt(latestModular.timestamp, 10) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
    <span class="footer-sep">&middot;</span>
    <a href="https://docs.tempo.xyz/guide/node" target="_blank" rel="noopener">Node docs</a>
    <span class="footer-sep">&middot;</span>
    <a href="https://github.com/tempoxyz/tempo" target="_blank" rel="noopener">GitHub</a>
  </footer>

  <script>
    var EMPTY_PRESET_SIZES = ${safeJsonForInlineScript(defaultPresetSizes)};
    var PRESET_SIZES = ${safeJsonForInlineScript(presetSizes)};
    var SNAPSHOT_PRESET_SIZES = ${safeJsonForInlineScript(snapshotPresetSizes)};
    var NETWORK_OPTIONS = ${safeJsonForInlineScript(networkOptions)};
    var NETWORK_SNAPSHOTS = ${safeJsonForInlineScript(modularSnapshotOptionsByChain)};
    var LATEST_SNAPSHOTS_BY_NETWORK = ${safeJsonForInlineScript(latestSnapshotsByChain)};
    var activeChainId = ${safeJsonForInlineScript(selectedChainId)};
    var latestModularSnapshotId = ${safeJsonForInlineScript(latestModular?.snapshotId || null)};
    var COMPONENTS = [
      { id: 'state',     name: 'state',              desc: 'MDBX database',                      color: 'var(--disk-state)',     required: true },
      { id: 'headers',   name: 'headers',            desc: 'Block header static files',           color: 'var(--disk-headers)',   required: true },
      { id: 'txs',       name: 'transactions',       desc: 'Transaction static files',            color: 'var(--disk-txs)',       required: false },
      { id: 'tx_send',   name: 'senders',              desc: 'Transaction sender static files',    color: 'var(--disk-tx-send)',   required: false },
      { id: 'receipts',  name: 'receipts',           desc: 'Receipt static files',                color: 'var(--disk-receipts)',  required: false },
      { id: 'acc_cs',    name: 'state history',        desc: 'Account & storage changeset static files', color: 'var(--disk-acc-cs)',    required: false, group: ['acc_cs', 'sto_cs'] },
      { id: 'sto_cs',    name: 'storage changesets',  desc: 'Storage changeset static files',     color: 'var(--disk-sto-cs)',    required: false, groupedUnder: 'acc_cs' },
      { id: 'indices',   name: 'indices',             desc: 'Archive node RocksDB indices (transaction lookup, account/storage history)', color: 'var(--disk-indices)',   required: false }
    ];

    var COMPONENT_SIZE_KEYS = {
      'state': 'state', 'headers': 'headers', 'txs': 'transactions', 'tx_send': 'transaction_senders',
      'receipts': 'receipts', 'acc_cs': 'account_changesets', 'sto_cs': 'storage_changesets', 'indices': 'rocksdb_indices'
    };

    var PRESETS = {
      minimal:  { checked: ['state', 'headers'] },
      full:     { checked: ['state', 'headers', 'txs', 'receipts', 'acc_cs', 'sto_cs'] },
      archive:  { checked: ['state', 'headers', 'txs', 'tx_send', 'receipts', 'acc_cs', 'sto_cs', 'indices'] }
    };

    var checkedComponents = new Set(PRESETS.archive.checked);
    var activePreset = 'archive';
    var presetBaseComponents = new Set(PRESETS.archive.checked);
    var activeSnapshotId = latestModularSnapshotId;
    var activeSnapshotUrl = null;

    function getComponentSizeGB(componentId) {
      var key = COMPONENT_SIZE_KEYS[componentId];
      if (checkedComponents.has(componentId) && !presetBaseComponents.has(componentId)) {
        return PRESET_SIZES.archive[key] || 0;
      }
      return (PRESET_SIZES[activePreset] || PRESET_SIZES.archive)[key] || 0;
    }

    function getMinimalSizeGB(componentId) {
      var key = COMPONENT_SIZE_KEYS[componentId];
      return PRESET_SIZES.minimal[key] || 0;
    }

    function fmtSize(gb) {
      if (gb === 0) return '0 GB';
      if (gb >= 1000) return (gb / 1000).toFixed(1).replace(/\\.0$/, '') + ' TB';
      if (gb < 1) return Math.round(gb * 1000) + ' MB';
      return Math.round(gb) + ' GB';
    }

    function getSnapshotsForActiveNetwork() {
      return NETWORK_SNAPSHOTS[activeChainId] || [];
    }

    function getLatestSnapshotForActiveNetwork() {
      return LATEST_SNAPSHOTS_BY_NETWORK[activeChainId] || null;
    }

    function getActiveSnapshot() {
      if (!activeSnapshotId) return null;
      return getSnapshotsForActiveNetwork().find(function(snapshot) {
        return snapshot.snapshotId === activeSnapshotId;
      }) || null;
    }

    function hasActiveModularSnapshot() {
      return !!getActiveSnapshot();
    }

    function formatSnapshotOption(snapshot, index) {
      var label = index === 0 ? 'Latest' : 'Block ' + snapshot.block.toLocaleString();
      return label + ' · ' + snapshot.date + ' · ' + snapshot.image;
    }

    function formatFooterDate(timestamp) {
      return new Date(parseInt(timestamp, 10) * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    function isSendersAvailable() {
      if (!checkedComponents.has('txs')) return false;
      var key = COMPONENT_SIZE_KEYS['txs'];
      return getComponentSizeGB('txs') >= (PRESET_SIZES.archive[key] || 0);
    }

    function isIndicesAvailable() {
      var required = PRESETS.archive.checked.filter(function(id) { return id !== 'indices' && id !== 'tx_send'; });
      return required.every(function(id) { return checkedComponents.has(id); });
    }

    function renderChecklist() {
      var body = document.getElementById('checklistBody');
      body.innerHTML = COMPONENTS.filter(function(c) { return !c.groupedUnder; }).map(function(c) {
        var isChecked = checkedComponents.has(c.id);
        var isRequired = c.required;
        var isDisabled = isRequired || (c.id === 'indices' && !isIndicesAvailable()) || (c.id === 'tx_send' && !isSendersAvailable());
        var sizeGB = isChecked ? getComponentSizeGB(c.id) : getMinimalSizeGB(c.id);
        if (c.group) {
          c.group.forEach(function(gid) {
            if (gid !== c.id) sizeGB += isChecked ? getComponentSizeGB(gid) : getMinimalSizeGB(gid);
          });
        }
        return '<div class="checklist-row' + (isChecked ? ' checked' : '') + (isDisabled ? ' disabled' : '') + '" onclick="' + (isDisabled ? '' : 'toggleComponent(\\'' + c.id + '\\')') + '">' +
          '<div class="checklist-check"><input type="checkbox"' + (isChecked ? ' checked' : '') + (isDisabled ? ' disabled' : '') + ' onclick="event.stopPropagation();' + (isDisabled ? 'event.preventDefault()' : 'toggleComponent(\\'' + c.id + '\\')') + '"></div>' +
          '<div class="checklist-name">' + c.name + '</div>' +
          '<div class="checklist-desc">' + c.desc + '</div>' +
          '<div class="checklist-size-cell">' + fmtSize(sizeGB) + '</div>' +
        '</div>';
      }).join('');
    }

    function renderDiskBar() {
      var archiveSizes = PRESET_SIZES.archive;
      var totalArchive = 0;
      COMPONENTS.forEach(function(c) {
        var key = COMPONENT_SIZE_KEYS[c.id];
        totalArchive += archiveSizes[key] || 0;
      });
      var hasSizes = totalArchive > 0;

      var totalDownload = 0;
      COMPONENTS.forEach(function(c) {
        if (checkedComponents.has(c.id)) {
          totalDownload += getComponentSizeGB(c.id);
        } else {
          totalDownload += getMinimalSizeGB(c.id);
        }
      });

      if (hasSizes) {
        document.getElementById('diskTotal').textContent = '~' + fmtSize(totalDownload);
      } else {
        var checkedCount = 0;
        COMPONENTS.forEach(function(c) { if (checkedComponents.has(c.id)) checkedCount++; });
        document.getElementById('diskTotal').textContent = checkedCount + ' / ' + COMPONENTS.length + ' components';
      }

      var barHtml = '';
      var legendHtml = '';
      COMPONENTS.forEach(function(c) {
        var isChecked = checkedComponents.has(c.id);
        var key = COMPONENT_SIZE_KEYS[c.id];
        var activeSize = isChecked ? getComponentSizeGB(c.id) : getMinimalSizeGB(c.id);
        var archiveSize = archiveSizes[key] || 0;
        if (archiveSize === 0) return;

        var groupPct = (archiveSize / totalArchive * 100).toFixed(2);
        barHtml += '<div class="disk-segment-group" data-comp="' + c.id + '" style="width:' + groupPct + '%" onmouseenter="highlightSegment(\\'' + c.id + '\\')" onmouseleave="clearHighlight()">';
        if (activeSize > 0) {
          var activeFrac = Math.min(activeSize / archiveSize * 100, 100).toFixed(2);
          barHtml += '<div class="disk-segment" style="width:' + activeFrac + '%;background:' + c.color + '"></div>';
          var remainder = archiveSize - activeSize;
          if (remainder > 0) {
            var remFrac = (remainder / archiveSize * 100).toFixed(2);
            barHtml += '<div class="disk-segment unchecked" style="width:' + remFrac + '%;background:' + c.color + '"></div>';
          }
        } else {
          barHtml += '<div class="disk-segment unchecked" style="width:100%;background:' + c.color + '"></div>';
        }
        barHtml += '</div>';

        var sizeLabel = activeSize > 0 ? fmtSize(activeSize) : fmtSize(archiveSize);
        var unc = activeSize > 0 ? '' : ' unchecked';
        legendHtml += '<div class="disk-legend-item' + unc + '" data-comp="' + c.id + '" onmouseenter="highlightSegment(\\'' + c.id + '\\')" onmouseleave="clearHighlight()">' +
          '<div class="disk-legend-swatch" style="background:' + c.color + '"></div>' +
          '<span>' + c.name + '</span>' +
          '<span class="disk-legend-size">' + sizeLabel + '</span>' +
        '</div>';
      });

      document.getElementById('diskBar').innerHTML = barHtml;
      document.getElementById('diskLegend').innerHTML = legendHtml;
    }

    function renderCapabilities() {
      var caps = [];
      var hasState = checkedComponents.has('state') && checkedComponents.has('headers');
      var hasTxs = checkedComponents.has('txs');
      var hasReceipts = checkedComponents.has('receipts');
      var hasChangesets = checkedComponents.has('acc_cs') && checkedComponents.has('sto_cs');
      var hasIndices = checkedComponents.has('indices');

      var isArchive = activePreset === 'archive';
      var isFull = activePreset === 'full';

      if (hasState) {
        caps.push('Sync to tip');
        caps.push('Consensus validation');
        caps.push('P2P');
        if (isArchive) {
          caps.push('eth_getBalance');
          caps.push('eth_call');
        } else {
          caps.push('eth_getBalance (latest)');
          caps.push('eth_call (latest)');
        }
      }
      if (hasState && hasTxs) {
        if (isArchive) {
          caps.push('eth_getTransactionByHash');
          caps.push('eth_getBlockByNumber (full txs)');
        } else if (isFull) {
          caps.push('eth_getTransactionByHash (full history)');
          caps.push('eth_getBlockByNumber (full tx history)');
        }
      }
      if (hasState && hasReceipts) {
        if (isArchive) {
          caps.push('eth_getTransactionReceipt');
          caps.push('eth_getLogs');
          caps.push('eth_getBlockReceipts');
        } else {
          caps.push('eth_getTransactionReceipt (latest)');
          caps.push('eth_getLogs (latest)');
          caps.push('eth_getBlockReceipts (latest)');
        }
      }

      if (hasState && hasChangesets && hasTxs && isArchive) {
        caps.push('debug_traceTransaction');
      }
      if (hasState && hasIndices) {
        caps.push('Skip index rebuild');
      }
      var el = document.getElementById('capabilitiesItems');
      el.innerHTML = caps.length > 0
        ? caps.map(function(c) { return '<span class="cap-item">' + c + '</span>'; }).join('')
        : '<span style="color:var(--muted);font-size:0.8rem">Select components to unlock capabilities</span>';
    }

    function updateModularCmd() {
      var latestSnapshot = getLatestSnapshotForActiveNetwork();

      if (!hasActiveModularSnapshot()) {
        var legacyCmd = 'tempo download';
        if (activeChainId !== '${DEFAULT_CHAIN_ID}') {
          var legacyNetwork = NETWORK_OPTIONS.find(function(option) { return option.chainId === activeChainId; });
          if (legacyNetwork) legacyCmd += ' --chain ' + legacyNetwork.key;
        }
        if (latestSnapshot && latestSnapshot.archiveUrl) {
          legacyCmd += ' -u ' + latestSnapshot.archiveUrl;
        }
        document.getElementById('modularCmdText').textContent = legacyCmd;
        document.getElementById('cmdToggle').style.display = 'none';
        document.querySelector('#modularCmd .cmd-prefix').style.display = '';
        return;
      }

      var ids = [];
      COMPONENTS.forEach(function(c) { if (checkedComponents.has(c.id)) ids.push(c.id); });
      var minIds = PRESETS.minimal.checked.slice().sort().join(',');
      var fullIds = PRESETS.full.checked.slice().sort().join(',');
      var archiveIds = PRESETS.archive.checked.slice().sort().join(',');
      var archiveNoRocksIds = PRESETS.archive.checked.filter(function(id) { return id !== 'indices'; }).sort().join(',');
      var curIds = ids.slice().sort().join(',');

      var cmd = 'tempo download';
      if (activePreset === 'minimal' && curIds === minIds) {
        cmd += ' --minimal';
      } else if (activePreset === 'full' && curIds === fullIds) {
        cmd += ' --full';
      } else if (activePreset === 'archive' && curIds === archiveIds) {
        cmd += ' --archive';
      } else if (activePreset === 'archive' && curIds === archiveNoRocksIds) {
        cmd += ' --archive --without-rocksdb';
      } else {
        var flags = [];
        if (checkedComponents.has('txs')) flags.push('--with-txs');
        if (checkedComponents.has('tx_send')) flags.push('--with-senders');
        if (checkedComponents.has('receipts')) flags.push('--with-receipts');
        if (checkedComponents.has('acc_cs') || checkedComponents.has('sto_cs')) flags.push('--with-state-history');
        if (flags.length > 0) cmd += ' ' + flags.join(' ');
      }
      if (activeChainId !== '${DEFAULT_CHAIN_ID}') {
        var network = NETWORK_OPTIONS.find(function(option) { return option.chainId === activeChainId; });
        if (network) cmd += ' --chain ' + network.key;
      }
      if (activeSnapshotUrl) {
        cmd += ' --manifest-url ' + activeSnapshotUrl;
      }

      var snapshot = getActiveSnapshot();
      var latestSnapshotForNetwork = getLatestSnapshotForActiveNetwork();
      var manifestUrl = snapshot ? snapshot.manifestUrl : (latestSnapshotForNetwork ? latestSnapshotForNetwork.manifestUrl : null);
      var toggle = document.getElementById('cmdToggle');

      if (manifestUrl) {
        toggle.style.display = 'flex';
      } else {
        toggle.style.display = 'none';
      }

      if (cmdMode === 'url' && manifestUrl) {
        document.querySelector('#modularCmd .cmd-prefix').style.display = 'none';
        document.getElementById('modularCmdText').textContent = manifestUrl;
      } else {
        document.querySelector('#modularCmd .cmd-prefix').style.display = '';
        document.getElementById('modularCmdText').textContent = cmd;
      }
    }

    function updatePresetHighlight() {
      var ids = [];
      COMPONENTS.forEach(function(c) { if (checkedComponents.has(c.id)) ids.push(c.id); });
      var curIds = ids.slice().sort().join(',');
      var presetIds = PRESETS[activePreset].checked.slice().sort().join(',');
      var isModified = curIds !== presetIds;

      ['minimal', 'full', 'archive'].forEach(function(p) {
        var el = document.getElementById('preset-' + p);
        el.classList.remove('active', 'modified');
        if (p === activePreset) el.classList.add(isModified ? 'modified' : 'active');
      });
    }

    function highlightSegment(id) {
      document.querySelectorAll('.disk-segment-group[data-comp="' + id + '"]').forEach(function(el) {
        el.classList.add('highlight');
      });
      document.querySelectorAll('.disk-legend-item[data-comp="' + id + '"]').forEach(function(el) {
        el.classList.add('highlight');
      });
    }

    function clearHighlight() {
      document.querySelectorAll('.disk-segment-group.highlight').forEach(function(el) {
        el.classList.remove('highlight');
      });
      document.querySelectorAll('.disk-legend-item.highlight').forEach(function(el) {
        el.classList.remove('highlight');
      });
    }

    function updateSnapshotOptions() {
      var select = document.getElementById('snapshotSelect');
      var snapshots = getSnapshotsForActiveNetwork();

      if (!snapshots.length) {
        select.innerHTML = '<option value="">No v2 manifests yet</option>';
        select.disabled = true;
        return;
      }

      select.disabled = false;
      select.innerHTML = snapshots.map(function(snapshot, index) {
        var selected = snapshot.snapshotId === activeSnapshotId ? ' selected' : '';
        return '<option value="' + snapshot.snapshotId + '"' + selected + '>' + formatSnapshotOption(snapshot, index) + '</option>';
      }).join('');
    }

    function updateSnapshotIndicator(snapshot, latestSnapshot) {
      var indicator = document.getElementById('snapshotIndicator');

      if (snapshot && latestSnapshot && snapshot.snapshotId !== latestSnapshot.snapshotId) {
        document.getElementById('snapshotIndicatorText').textContent = 'Snapshot at block ' + snapshot.block.toLocaleString();
        indicator.style.display = 'flex';
        document.getElementById('snapshotIndicatorReset').style.display = '';
      } else {
        indicator.style.display = 'none';
      }
    }

    function updateStatusNote() {
      var status = document.getElementById('snapshotStatusNote');
      var snapshot = getActiveSnapshot();
      var latestSnapshot = getLatestSnapshotForActiveNetwork();
      var network = NETWORK_OPTIONS.find(function(option) { return option.chainId === activeChainId; });
      var networkName = network ? network.name : activeChainId;

      if (snapshot) {
        status.textContent = networkName + ' · block ' + snapshot.block.toLocaleString() + ' · ' + snapshot.date + ' · ' + snapshot.image;
        return;
      }

      if (latestSnapshot) {
        status.textContent = 'No v2 manifest is available for ' + networkName + ' yet. The command above falls back to the latest legacy archive from ' + latestSnapshot.date + '.';
        return;
      }

      status.textContent = 'No snapshots are available for ' + networkName + '.';
    }

    var cmdMode = 'command';

    function setCmdMode(mode) {
      cmdMode = mode;
      var buttons = document.getElementById('cmdToggle').querySelectorAll('button');
      buttons.forEach(function(btn) { btn.classList.remove('active'); });
      buttons[mode === 'command' ? 0 : 1].classList.add('active');
      updateModularCmd();
    }

    function updateFooterStatus() {
      var footer = document.getElementById('footerStatus');
      var latestSnapshot = getLatestSnapshotForActiveNetwork();
      var network = NETWORK_OPTIONS.find(function(option) { return option.chainId === activeChainId; });
      var networkName = network ? network.name : activeChainId;

      if (!latestSnapshot) {
        footer.textContent = networkName + ' · no snapshots published yet';
        return;
      }

      footer.textContent = networkName + ' · latest snapshot block ' + latestSnapshot.block.toLocaleString() + ' · ' + formatFooterDate(latestSnapshot.timestamp);
    }

    function updateInteractiveState() {
      var disabled = !hasActiveModularSnapshot();
      document.getElementById('presets').classList.toggle('disabled-panel', disabled);
      document.getElementById('capabilitiesSection').classList.toggle('disabled-panel', disabled);
      document.getElementById('diskBarSection').classList.toggle('disabled-panel', disabled);
      document.getElementById('checklistSection').classList.toggle('disabled-panel', disabled);
    }

    function configureSnapshot(snapshotId, options) {
      options = options || {};
      activeSnapshotId = snapshotId;

      var snapshots = getSnapshotsForActiveNetwork();
      latestModularSnapshotId = snapshots[0] ? snapshots[0].snapshotId : null;

      var snapshot = getActiveSnapshot();
      activeSnapshotUrl = snapshot && snapshot.snapshotId !== latestModularSnapshotId ? snapshot.manifestUrl : null;
      PRESET_SIZES = snapshot ? (SNAPSHOT_PRESET_SIZES[snapshot.snapshotId] || EMPTY_PRESET_SIZES) : EMPTY_PRESET_SIZES;

      updateSnapshotOptions();
      updateSnapshotIndicator(snapshot, snapshots[0] || null);
      renderAll();

      if (!options.preserveScroll) {
        window.scrollTo(0, 0);
      }
    }

    function configureNetwork(chainId) {
      activeChainId = chainId;
      document.getElementById('networkSelect').value = chainId;
      configureSnapshot((getSnapshotsForActiveNetwork()[0] || {}).snapshotId || null, { preserveScroll: true });
    }

    function selectPreset(name) {
      if (!hasActiveModularSnapshot()) return;
      activePreset = name;
      checkedComponents = new Set(PRESETS[name].checked);
      presetBaseComponents = new Set(PRESETS[name].checked);
      COMPONENTS.forEach(function(c) { if (c.required) checkedComponents.add(c.id); });
      renderAll();
    }

    function toggleComponent(id) {
      if (!hasActiveModularSnapshot()) return;
      var comp = COMPONENTS.find(function(c) { return c.id === id; });
      if (comp && comp.required) return;
      var ids = comp && comp.group ? comp.group : [id];
      var adding = !checkedComponents.has(id);
      ids.forEach(function(i) { adding ? checkedComponents.add(i) : checkedComponents.delete(i); });
      if (!adding && activePreset === 'full') {
        activePreset = 'minimal';
        presetBaseComponents = new Set(PRESETS.minimal.checked);
      }
      if (!isSendersAvailable()) checkedComponents.delete('tx_send');
      if (!isIndicesAvailable()) checkedComponents.delete('indices');

      var curSet = [];
      COMPONENTS.forEach(function(c) { if (checkedComponents.has(c.id)) curSet.push(c.id); });
      var curKey = curSet.sort().join(',');
      var archiveKey = PRESETS.archive.checked.slice().sort().join(',');
      if (curKey === archiveKey) {
        activePreset = 'archive';
        presetBaseComponents = new Set(PRESETS.archive.checked);
      }

      renderAll();
    }

    function renderPresetSizes() {
      ['minimal', 'full', 'archive'].forEach(function(p) {
        var sizes = PRESET_SIZES[p];
        var total = PRESETS[p].checked.reduce(function(a, id) {
          var key = COMPONENT_SIZE_KEYS[id];
          return a + (sizes[key] || 0);
        }, 0);
        var el = document.getElementById('preset-' + p + '-size');
        if (el) el.textContent = total > 0 ? '~' + fmtSize(total) : '';
      });
    }

    function renderAll() {
      renderChecklist();
      renderDiskBar();
      renderCapabilities();
      updateModularCmd();
      updatePresetHighlight();
      renderPresetSizes();
      updateStatusNote();
      updateFooterStatus();
      updateInteractiveState();
    }

    function initializeFilters() {
      var networkSelect = document.getElementById('networkSelect');
      networkSelect.innerHTML = NETWORK_OPTIONS.map(function(option) {
        return '<option value="' + option.chainId + '">' + option.name + (option.hasModular ? '' : ' · legacy only') + '</option>';
      }).join('');
      networkSelect.value = activeChainId;
      networkSelect.addEventListener('change', function(event) {
        configureNetwork(event.target.value);
      });

      document.getElementById('snapshotSelect').addEventListener('change', function(event) {
        configureSnapshot(event.target.value);
      });
    }

    initializeFilters();
    configureNetwork(activeChainId);

    function toggleTheme() {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    function copyCmdText(el, text) {
      navigator.clipboard.writeText(text).then(() => {
        var orig = el.innerHTML;
        el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        el.classList.add('copied');
        setTimeout(() => { el.innerHTML = orig; el.classList.remove('copied'); }, 2000);
      });
    }
  </script>
</body>
</html>`

	const response = new Response(body, {
		headers: {
			'Content-Type': 'text/html;charset=utf-8',
			'Cache-Control': `public, max-age=${CACHE_TTL}`,
		},
	})

	// Cache the rendered HTML at the edge
	await cache.put(cacheKey, response.clone())

	return response
}
