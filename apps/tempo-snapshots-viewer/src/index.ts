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

interface SnapshotIndex {
	version: number
	generatedAt: string
	snapshots: Snapshot[]
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
	'31318': { chainId: '31318', key: 'devnet', name: 'Devnet' },
}

const DEFAULT_CHAIN_ID = '4217'
const SNAPSHOT_INDEX_KEY = '_index.json'
const SNAPSHOT_INDEX_VERSION = 2
const RECENT_SNAPSHOTS_PER_NETWORK = 5
const SNAPSHOT_HISTORY_PAGE_SIZE = 5
const SNAPSHOT_HISTORY_MAX_PAGE_SIZE = 25

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
	const order = [DEFAULT_CHAIN_ID, '42431', '31318']
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

app.get('/api/snapshots/history', (context) =>
	handleSnapshotHistory(context.req.raw, context.env),
)
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
	await writeSnapshotIndex(env, snapshots)
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

async function listSnapshotDirs(
	bucket: R2Bucket,
	prefix: string,
): Promise<string[]> {
	const dirs: string[] = []
	let cursor: string | undefined
	while (true) {
		const res = await withR2Retry(
			`listing snapshot prefixes for ${prefix}`,
			() => bucket.list({ cursor, delimiter: '/', prefix }),
		)
		if (res.delimitedPrefixes) {
			dirs.push(...res.delimitedPrefixes)
		}
		if (!res.truncated) break
		cursor = res.cursor
	}
	return dirs
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

interface SnapshotDirInfo {
	dir: string
	chainId: string
	block: number
	timestamp: number
}

interface LegacyMetadataInfo {
	object: R2Object
	chainId: string
	block: number
	timestamp: number
}

function parseSnapshotDirInfo(dir: string): SnapshotDirInfo | null {
	const normalized = dir.replace(/\/$/, '')
	const match = /^tempo-(\d+)-(\d+)-(\d+)$/.exec(normalized)
	if (!match) return null

	return {
		dir: normalized,
		chainId: match[1] || '',
		block: Number.parseInt(match[2] || '0', 10),
		timestamp: Number.parseInt(match[3] || '0', 10),
	}
}

function parseLegacyMetadataInfo(object: R2Object): LegacyMetadataInfo | null {
	const match = /^tempo-(\d+)-(\d+)-(\d+)\.json$/.exec(object.key)
	if (!match) return null

	return {
		object,
		chainId: match[1] || '',
		block: Number.parseInt(match[2] || '0', 10),
		timestamp: Number.parseInt(match[3] || '0', 10),
	}
}

function compareSnapshotInfoDesc(
	a: SnapshotDirInfo | LegacyMetadataInfo,
	b: SnapshotDirInfo | LegacyMetadataInfo,
): number {
	return b.block - a.block || b.timestamp - a.timestamp
}

function selectRecentSnapshotDirsByNetwork(
	dirs: string[],
	limit: number,
): string[] {
	const byChain = new Map<string, SnapshotDirInfo[]>()
	for (const dir of dirs) {
		const info = parseSnapshotDirInfo(dir)
		if (!info) continue

		const chainSnapshots = byChain.get(info.chainId) || []
		chainSnapshots.push(info)
		byChain.set(info.chainId, chainSnapshots)
	}

	return [...byChain.values()].flatMap((snapshots) =>
		snapshots
			.sort(compareSnapshotInfoDesc)
			.slice(0, limit)
			.map((s) => s.dir),
	)
}

function selectRecentLegacyMetadataFilesByNetwork(
	objects: R2Object[],
	limit: number,
): R2Object[] {
	const byChain = new Map<string, LegacyMetadataInfo[]>()
	for (const object of objects) {
		const info = parseLegacyMetadataInfo(object)
		if (!info) continue

		const chainSnapshots = byChain.get(info.chainId) || []
		chainSnapshots.push(info)
		byChain.set(info.chainId, chainSnapshots)
	}

	return [...byChain.values()].flatMap((snapshots) =>
		snapshots
			.sort(compareSnapshotInfoDesc)
			.slice(0, limit)
			.map((s) => s.object),
	)
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

function manifestToSnapshot(
	env: Env,
	dirName: string,
	manifest: SnapshotManifest,
	manifestKey: string,
): Snapshot {
	const chainId = String(manifest.chain_id)
	const network = getNetworkInfo(chainId)
	const baseUrl = `${env.R2_PUBLIC_URL}/${dirName}`

	const date = new Date(manifest.timestamp * 1000).toISOString().split('T')[0]

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
}

async function loadModularSnapshot(
	env: Env,
	dir: string,
): Promise<Snapshot | null> {
	const dirName = dir.replace(/\/$/, '')
	const manifestKey = `${dirName}/manifest.json`

	try {
		const obj = await withR2Retry(`fetching manifest ${manifestKey}`, () =>
			env.SNAPSHOTS.get(manifestKey),
		)
		if (!obj) return null

		const manifest: SnapshotManifest = await obj.json()

		if (!(await isManifestLikelyComplete(env.SNAPSHOTS, manifest, dirName))) {
			console.warn(`Skipping incomplete snapshot: ${manifestKey}`)
			return null
		}

		return manifestToSnapshot(env, dirName, manifest, manifestKey)
	} catch (err) {
		console.error(`Failed to parse manifest ${manifestKey}:`, err)
		return null
	}
}

async function loadLegacySnapshot(
	env: Env,
	file: R2Object,
): Promise<Snapshot | null> {
	try {
		const obj = await withR2Retry(`fetching legacy metadata ${file.key}`, () =>
			env.SNAPSHOTS.get(file.key),
		)
		if (!obj) return null

		const metadata: LegacyMetadata = await obj.json()
		const chainId = String(metadata.chain_id)
		const network = getNetworkInfo(chainId)

		const archiveUrl = `${env.R2_PUBLIC_URL}/${metadata.archive}`
		const metadataUrl = `${env.R2_PUBLIC_URL}/${file.key}`

		const date = new Date(parseInt(metadata.timestamp, 10) * 1000)
			.toISOString()
			.split('T')[0]

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

		return {
			snapshotId: metadataUrl,
			chainId,
			networkKey: network.key,
			networkName: network.name,
			block: metadata.block,
			timestamp: metadata.timestamp,
			date,
			image: metadata.image || 'legacy',
			archiveUrl,
			archiveFile: metadata.archive,
			metadataUrl,
			size: archiveHead.size,
			isModular: false,
		}
	} catch (err) {
		console.error(`Failed to parse ${file.key}:`, err)
		return null
	}
}

function sortSnapshotsByTimestampDesc(snapshots: Snapshot[]): Snapshot[] {
	return snapshots.sort(
		(a, b) => parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10),
	)
}

// Build the recent index from R2. The request path reads the persisted index
// instead of doing this scan unless the index is missing.
async function getSnapshots(env: Env): Promise<Snapshot[]> {
	const { dirs, objects: rootObjects } = await listRoot(env.SNAPSHOTS)
	const recentDirs = selectRecentSnapshotDirsByNetwork(
		dirs,
		RECENT_SNAPSHOTS_PER_NETWORK,
	)
	const legacyMetadataFiles = selectRecentLegacyMetadataFilesByNetwork(
		rootObjects,
		RECENT_SNAPSHOTS_PER_NETWORK,
	)

	const manifestResults = await mapWithConcurrency(
		recentDirs,
		SNAPSHOT_FETCH_CONCURRENCY,
		(dir) => loadModularSnapshot(env, dir),
	)

	const legacyResults = await mapWithConcurrency(
		legacyMetadataFiles,
		SNAPSHOT_FETCH_CONCURRENCY,
		(file) => loadLegacySnapshot(env, file),
	)

	return sortSnapshotsByTimestampDesc([
		...manifestResults.filter((s): s is Snapshot => s !== null),
		...legacyResults.filter((s): s is Snapshot => s !== null),
	])
}

const CACHE_VERSION = 'v21'
const VIEWER_ORIGIN = 'https://snapshots.tempo.xyz'
const CACHE_KEY_FULL = `${VIEWER_ORIGIN}/cache/${CACHE_VERSION}/full`
const CACHE_KEY_API = `${VIEWER_ORIGIN}/cache/${CACHE_VERSION}/api`
const CACHE_KEY_UI_HTML = `${VIEWER_ORIGIN}/cache/${CACHE_VERSION}/ui-html`
const CACHE_TTL = 3600 // 1 hour — snapshots change at most once per day
let snapshotRefreshPromise: Promise<Snapshot[]> | undefined

function isSnapshotIndex(value: unknown): value is SnapshotIndex {
	if (!value || typeof value !== 'object') return false
	const candidate = value as Partial<SnapshotIndex>
	return (
		candidate.version === SNAPSHOT_INDEX_VERSION &&
		typeof candidate.generatedAt === 'string' &&
		Array.isArray(candidate.snapshots)
	)
}

async function readSnapshotIndex(env: Env): Promise<Snapshot[] | null> {
	const obj = await withR2Retry(`fetching ${SNAPSHOT_INDEX_KEY}`, () =>
		env.SNAPSHOTS.get(SNAPSHOT_INDEX_KEY),
	)
	if (!obj) return null

	try {
		const index: unknown = await obj.json()
		if (!isSnapshotIndex(index)) {
			console.warn(`Ignoring invalid ${SNAPSHOT_INDEX_KEY}`)
			return null
		}

		return sortSnapshotsByTimestampDesc(index.snapshots)
	} catch (err) {
		console.warn(`Failed to parse ${SNAPSHOT_INDEX_KEY}:`, err)
		return null
	}
}

async function writeSnapshotIndex(
	env: Env,
	snapshots: Snapshot[],
): Promise<void> {
	const index: SnapshotIndex = {
		version: SNAPSHOT_INDEX_VERSION,
		generatedAt: new Date().toISOString(),
		snapshots,
	}

	await withR2Retry(`writing ${SNAPSHOT_INDEX_KEY}`, () =>
		env.SNAPSHOTS.put(SNAPSHOT_INDEX_KEY, JSON.stringify(index), {
			httpMetadata: { contentType: 'application/json' },
		}),
	)
}

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

	const indexedSnapshots = await readSnapshotIndex(env)
	if (indexedSnapshots) {
		await populateSnapshotCaches(cache, indexedSnapshots)
		return indexedSnapshots
	}

	snapshotRefreshPromise ??= getSnapshots(env)
		.then(async (snapshots) => {
			await writeSnapshotIndex(env, snapshots)
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

function clampHistoryLimit(value: string | null): number {
	const limit = Number.parseInt(value || '', 10)
	if (!Number.isFinite(limit)) return SNAPSHOT_HISTORY_PAGE_SIZE
	return Math.min(Math.max(limit, 1), SNAPSHOT_HISTORY_MAX_PAGE_SIZE)
}

function stripSnapshotHistoryInternals(snapshots: Snapshot[]): Snapshot[] {
	return snapshots.map(({ rawManifest, ...rest }) => rest)
}

async function getSnapshotHistoryPage(
	env: Env,
	chainId: string,
	beforeBlock: number,
	limit: number,
): Promise<{ snapshots: Snapshot[]; hasMore: boolean }> {
	const dirs = await listSnapshotDirs(env.SNAPSHOTS, `tempo-${chainId}-`)
	const candidates = dirs
		.map(parseSnapshotDirInfo)
		.filter(
			(info): info is SnapshotDirInfo =>
				info !== null && info.chainId === chainId && info.block < beforeBlock,
		)
		.sort(compareSnapshotInfoDesc)

	const selected = candidates.slice(0, limit)
	const results = await mapWithConcurrency(
		selected.map((info) => info.dir),
		SNAPSHOT_FETCH_CONCURRENCY,
		(dir) => loadModularSnapshot(env, dir),
	)

	return {
		snapshots: sortSnapshotsByTimestampDesc(
			results.filter((snapshot): snapshot is Snapshot => snapshot !== null),
		),
		hasMore: candidates.length > selected.length,
	}
}

async function handleSnapshotHistory(
	req: Request,
	env: Env,
): Promise<Response> {
	const url = new URL(req.url)
	const chainId = url.searchParams.get('chainId') || DEFAULT_CHAIN_ID
	if (!/^\d+$/.test(chainId)) {
		return error(400, 'Invalid chainId')
	}

	const beforeBlock = Number.parseInt(
		url.searchParams.get('beforeBlock') || '',
		10,
	)
	if (!Number.isFinite(beforeBlock)) {
		return error(400, 'Invalid beforeBlock')
	}

	const page = await getSnapshotHistoryPage(
		env,
		chainId,
		beforeBlock,
		clampHistoryLimit(url.searchParams.get('limit')),
	)

	return new Response(
		JSON.stringify({
			snapshots: stripSnapshotHistoryInternals(page.snapshots),
			hasMore: page.hasMore,
		}),
		{
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': `public, max-age=${CACHE_TTL}`,
			},
		},
	)
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
  <title>Snapshots - Tempo</title>
  <meta name="description" content="Download Tempo snapshots. Select a network, snapshot, and data profile for the tempo download CLI.">
  <meta property="og:title" content="Snapshots - Tempo">
  <meta property="og:description" content="Download Tempo snapshots with network-aware profiles and generated tempo download commands.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${VIEWER_ORIGIN}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Snapshots - Tempo">
  <meta name="twitter:description" content="Download Tempo snapshots with network-aware profiles and generated tempo download commands.">
  <link rel="icon" type="image/x-icon" href="https://tempo.xyz/favicon.ico">
  <meta property="og:image" content="https://tempo.xyz/favicon.ico">
  <meta name="twitter:image" content="https://tempo.xyz/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --ease: cubic-bezier(0.22, 1, 0.36, 1);
      --duration: 250ms;
      --radius: 8px;
      color-scheme: light;
    }

    :root, .light {
      --bg: #fafafa;
      --fg: #0a0a0a;
      --secondary: #6e6e6e;
      --muted: #a1a1a1;
      --muted-bg: #f9f9f9;
      --border: #e5e5e5;
      --border-subtle: #f0f0f0;
      --accent: #3b82f6;
      --accent-muted: rgba(59, 130, 246, 0.1);
      --accent-dim: #3b82f6;
      --accent-strong: #2563eb;
      --surface: #ffffff;
      --surface-raised: #f9f9f9;
      --surface-hover: #f0f0f0;
      --th-bg: #f9f9f9;
      --row-border: #f0f0f0;
      --hero-glow-1: transparent;
      --hero-glow-2: transparent;
      --cmd-copy-hover-bg: #f0f0f0;
      --cmd-border: #e5e5e5;
      --option-bg: #fff;
      --badge-chain-bg: #f0f0f0;
      --badge-chain-fg: #6e6e6e;
      --badge-profile-bg: rgba(59, 130, 246, 0.1);
      --badge-profile-fg: #2563eb;
      --badge-channel-bg: rgba(22, 163, 74, 0.1);
      --badge-channel-fg: #15803d;
      --badge-edge-bg: rgba(202, 138, 4, 0.12);
      --badge-edge-fg: #a16207;
      --btn-primary-bg: #3b82f6;
      --btn-primary-hover: #2563eb;
      --size-fg: #0a0a0a;
      --count-badge-fg: #fff;
      --disk-state:    #2563eb;
      --disk-headers:  #3b82f6;
      --disk-txs:      #60a5fa;
      --disk-tx-send:  #93c5fd;
      --disk-receipts: #bfdbfe;
      --disk-acc-cs:   #dbeafe;
      --disk-sto-cs:   #e0f2fe;
      --disk-indices:  #e5e7eb;
    }

    .dark {
      color-scheme: dark;
      --bg: #111111;
      --fg: #ffffff;
      --secondary: #b0b0b0;
      --muted: #888888;
      --muted-bg: #1a1a1a;
      --border: #232323;
      --border-subtle: #1c1c1c;
      --accent: #60a5fa;
      --accent-muted: rgba(96, 165, 250, 0.1);
      --accent-dim: #60a5fa;
      --accent-strong: #93c5fd;
      --surface: #191919;
      --surface-raised: #1a1a1a;
      --surface-hover: #222222;
      --th-bg: #1a1a1a;
      --row-border: #232323;
      --hero-glow-1: transparent;
      --hero-glow-2: transparent;
      --cmd-copy-hover-bg: #222222;
      --cmd-border: #232323;
      --option-bg: #191919;
      --badge-chain-bg: #222222;
      --badge-chain-fg: #b0b0b0;
      --badge-profile-bg: rgba(96, 165, 250, 0.1);
      --badge-profile-fg: #93c5fd;
      --badge-channel-bg: rgba(48, 164, 108, 0.12);
      --badge-channel-fg: #30a46c;
      --badge-edge-bg: rgba(226, 163, 54, 0.12);
      --badge-edge-fg: #e2a336;
      --btn-primary-bg: #60a5fa;
      --btn-primary-hover: #93c5fd;
      --size-fg: #d4d4d4;
      --count-badge-fg: #111111;
      --disk-state:    #93c5fd;
      --disk-headers:  #60a5fa;
      --disk-txs:      #3b82f6;
      --disk-tx-send:  #2563eb;
      --disk-receipts: #1d4ed8;
      --disk-acc-cs:   #1e40af;
      --disk-sto-cs:   #1e3a8a;
      --disk-indices:  #172554;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.6;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    .site-shell {
      max-width: 1200px;
      min-height: 100vh;
      margin: 0 auto;
      padding: 1rem 1.5rem 0;
    }

    .site-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      padding: 2rem 0;
    }

    .wordmark {
      display: inline-flex;
      align-items: center;
      color: var(--fg);
      text-decoration: none;
    }

    .wordmark svg {
      width: auto;
      height: 22px;
      fill: currentColor;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .hero {
      position: relative;
      padding: 1rem 0 1.5rem;
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
      max-width: 40rem;
    }

    .hero h1 {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0;
      line-height: 1.1;
      color: var(--fg);
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
      border-radius: var(--radius);
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
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 0 4rem;
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

    .filter-group.snapshot-filter {
      flex: 1.35;
      min-width: 330px;
      max-width: 520px;
    }

    .filter-group label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0;
    }

    input, select {
      font-family: 'Inter', sans-serif;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 0.5rem 0.875rem;
      border-radius: var(--radius);
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

    .snapshot-control-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
    }

    .snapshot-control-row select {
      flex: 1;
      min-width: 0;
    }

    .snapshot-history-button {
      align-self: stretch;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--muted);
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.45rem 0.75rem;
      white-space: nowrap;
      transition: color var(--duration) var(--ease), border-color var(--duration) var(--ease), background var(--duration) var(--ease);
    }

    .snapshot-history-button:hover:not(:disabled) {
      border-color: var(--accent-dim);
      color: var(--fg);
    }

    .snapshot-history-button:disabled {
      cursor: default;
      opacity: 0.6;
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
      letter-spacing: 0;
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
      letter-spacing: 0;
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
      border-radius: var(--radius);
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0;
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
      border-radius: var(--radius);
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
      border-color: var(--accent);
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
      border-radius: var(--radius);
      background: var(--accent);
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
      letter-spacing: 0;
      color: var(--muted);
      display: flex;
      align-items: center;
    }

    @media (max-width: 768px) {
      .site-shell { padding: 1rem 1.25rem 0; }
      .site-header { align-items: flex-start; flex-direction: column; gap: 1rem; padding: 1.5rem 0; }
      .hero { padding: 0.5rem 0 1.25rem; }
      .hero h1 { font-size: 1.65rem; }
      .main { padding: 0 0 3rem; }
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
      animation: none;
    }

    .tabs {
      display: flex;
      gap: 0.375rem;
      margin-bottom: 2rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.25rem;
      width: fit-content;
    }

    .tab {
      padding: 0.5rem 1.25rem;
      border-radius: calc(var(--radius) - 2px);
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
      background: var(--accent-muted);
      color: var(--accent);
    }

    .tab-badge {
      font-size: 0.6rem;
      font-weight: 700;
      padding: 0.1rem 0.375rem;
      border-radius: calc(var(--radius) - 2px);
      background: oklch(0.72 0.17 155);
      color: white;
      letter-spacing: 0;
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
      margin-bottom: 0.875rem;
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
      border-bottom-left-radius: var(--radius);
    }

    .cmd-toggle button:last-child {
      border-bottom-right-radius: var(--radius);
    }

    .cmd-toggle button.active {
      color: var(--accent);
      background: var(--accent-muted);
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
      animation: none;
    }

    .presets {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      margin-bottom: 2.5rem;
    }

    .preset {
      position: relative;
      padding: 1.5rem;
      cursor: pointer;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      text-align: left;
      font-family: 'Inter', sans-serif;
      transition:
        background var(--duration) var(--ease),
        border-color var(--duration) var(--ease),
        box-shadow var(--duration) var(--ease);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .preset:hover {
      background: var(--surface-hover);
    }

    .preset:focus {
      outline: none;
    }

    .preset:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }

    .preset:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .preset:disabled:hover {
      background: var(--surface);
    }

    .preset.active {
      background: var(--accent-muted);
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent);
      z-index: 1;
    }

    .preset.modified {
      background: var(--accent-muted);
      border-color: var(--accent);
      box-shadow: inset 0 0 0 1px var(--accent);
      z-index: 1;
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
      letter-spacing: 0;
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
      letter-spacing: 0;
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
      letter-spacing: 0;
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
      border-radius: var(--radius);
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
      color: var(--fg);
      padding: 0.4rem 0.375rem 0.2rem;
      border-bottom: 1px solid transparent;
      cursor: default;
    }

    .disk-legend-item.highlight {
      border-bottom-color: var(--fg);
    }

    .disk-legend-item.not-selected {
      color: var(--muted);
      opacity: 0.45;
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
      border-radius: var(--radius);
      overflow: hidden;
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
      letter-spacing: 0;
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

    .checklist-row.disabled:hover {
      background: var(--surface);
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
      letter-spacing: 0;
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
      border-radius: var(--radius);
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
      border-radius: var(--radius);
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
      .checklist-row, .checklist-head {
        grid-template-columns: 2.5rem 1fr 1fr;
      }
      .checklist-desc {
        display: none;
      }
    }

    .theme-toggle {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
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
      padding: 2rem 0;
      color: var(--secondary);
      font-size: 0.8rem;
    }

    .footer a {
      color: var(--secondary);
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
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="https://tempo.xyz" target="_blank" rel="noopener" aria-label="Tempo">
        <svg viewBox="0 0 107 25" role="img" aria-hidden="true"><path d="M8.10464 23.7163H1.82475L7.64513 5.79356H0.201172L1.82475 0.540352H22.5637L20.9401 5.79356H13.8944L8.10464 23.7163Z"></path><path d="M31.474 23.7163H16.5861L24.0607 0.540352H38.8873L37.4782 4.95923H28.8701L27.3078 9.93433H35.6402L34.231 14.2914H25.8681L24.3057 19.2974H32.8525L31.474 23.7163Z"></path><path d="M38.2124 23.7163H33.2192L40.7244 0.540352H49.0567L48.781 13.0245L56.8989 0.540352H66.0277L58.5531 23.7163H52.3039L57.3584 7.86395L46.9736 23.7163H43.267L43.4201 7.80214L38.2124 23.7163Z"></path><path d="M73.057 4.83563L70.6369 12.3137H71.3108C72.8425 12.3137 74.1189 11.9532 75.14 11.2322C76.1612 10.4906 76.8249 9.43991 77.1312 8.08025C77.3967 6.90601 77.2538 6.07167 76.7023 5.57725C76.1509 5.08284 75.2319 4.83563 73.9453 4.83563H73.057ZM66.9915 23.7163H60.7116L68.1862 0.540352H75.814C77.5703 0.540352 79.0816 0.828764 80.3478 1.40559C81.6344 1.96181 82.5738 2.76524 83.166 3.81588C83.7787 4.84592 83.9829 6.05107 83.7787 7.43133C83.5132 9.2442 82.8189 10.8408 81.6956 12.221C80.5724 13.6013 79.1122 14.6725 77.315 15.4347C75.5383 16.1764 73.5471 16.5472 71.3415 16.5472H69.289L66.9915 23.7163Z"></path><path d="M98.747 22.233C96.664 23.4691 94.4481 24.0871 92.0996 24.0871H92.0383C89.9552 24.0871 88.1989 23.6236 86.7693 22.6965C85.3602 21.7489 84.3493 20.4717 83.7366 18.8648C83.1443 17.2579 83.0014 15.4966 83.3077 13.5807C83.6957 11.1704 84.5841 8.94549 85.9728 6.90601C87.3616 4.86653 89.0975 3.23906 91.1805 2.02361C93.2636 0.808164 95.4897 0.200439 97.8587 0.200439H97.9199C100.085 0.200439 101.872 0.663958 103.281 1.591C104.71 2.51803 105.701 3.78498 106.252 5.39185C106.824 6.97811 106.947 8.76008 106.62 10.7378C106.232 13.0657 105.343 15.2596 103.955 17.3197C102.566 19.3592 100.83 20.997 98.747 22.233ZM90.0777 18.2468C90.6292 19.2974 91.589 19.8227 92.9573 19.8227H93.0186C94.1418 19.8227 95.1833 19.4004 96.1432 18.5558C97.1235 17.6905 97.9506 16.5369 98.6245 15.0948C99.3189 13.6528 99.8294 12.0459 100.156 10.2742C100.463 8.54377 100.34 7.15322 99.7886 6.10257C99.2372 5.03133 98.2875 4.49571 96.9397 4.49571H96.8784C95.8369 4.49571 94.826 4.92833 93.8457 5.79356C92.8858 6.6588 92.0485 7.82274 91.3337 9.2854C90.6189 10.7481 90.0982 12.3343 89.7714 14.0442C89.4446 15.7747 89.5468 17.1755 90.0777 18.2468Z"></path></svg>
      </a>

      <div class="header-actions">
        <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle theme">
          <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        </button>
      </div>
    </header>

    <section class="hero">
      <div class="hero-inner fade-in">
        <h1>Snapshots</h1>
      </div>
    </section>

    <main class="main">
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
        <div class="filter-group snapshot-filter">
          <label for="snapshotSelect">Snapshot</label>
          <div class="snapshot-control-row">
            <select id="snapshotSelect"></select>
            <button class="snapshot-history-button" id="loadOlderSnapshots" type="button" onclick="loadOlderSnapshots()" style="display:none">Load older</button>
          </div>
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
          <span class="preset-desc">Tempo state and headers with minimal history. Limited historical RPC.</span>
          <span class="preset-ideal">Best for validators and constrained infrastructure</span>
        </button>
        <button class="preset" id="preset-full" disabled>
          <div class="preset-header">
            <span class="preset-radio"></span>
            <span class="preset-name">Full<span class="preset-modified-tag">(modified)</span></span>
            <span class="preset-size" id="preset-full-size"></span>
          </div>
          <span class="preset-desc">Transaction history with recent receipts and state history.</span>
          <span class="preset-ideal">Best for service backends and personal nodes</span>
        </button>
        <button class="preset active" onclick="selectPreset('archive')" id="preset-archive">
          <div class="preset-header">
            <span class="preset-radio"></span>
            <span class="preset-name">Archive<span class="preset-modified-tag">(modified)</span></span>
            <span class="preset-size" id="preset-archive-size"></span>
          </div>
          <span class="preset-desc">Complete Tempo history with transactions, senders, and indices.</span>
          <span class="preset-ideal">Best for RPC providers, indexers, and analysis</span>
        </button>
      </div>

      <div class="disk-bar-section" id="diskBarSection">
        <div class="disk-bar-label">
          <span class="disk-bar-title">Estimated download size</span>
          <span class="disk-bar-total" id="diskTotal">~200 GB</span>
        </div>
        <div class="disk-bar" id="diskBar"></div>
        <div class="disk-legend" id="diskLegend"></div>
        <div class="disk-note">Download sizes are compressed. Extracted node data will be larger on disk.</div>
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
    </main>

    <footer class="footer">
      <span id="footerStatus">Latest snapshot: block ${latestModular ? latestModular.block.toLocaleString() : '—'} · ${latestModular ? new Date(parseInt(latestModular.timestamp, 10) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
      <span class="footer-sep">&middot;</span>
      <a href="https://tempo.xyz" target="_blank" rel="noopener">About</a>
      <span class="footer-sep">&middot;</span>
      <a href="https://docs.tempo.xyz" target="_blank" rel="noopener">Docs</a>
      <span class="footer-sep">&middot;</span>
      <a href="https://github.com/tempoxyz/tempo" target="_blank" rel="noopener">GitHub</a>
    </footer>
  </div>

  <script>
    var EMPTY_PRESET_SIZES = ${safeJsonForInlineScript(defaultPresetSizes)};
    var PRESET_SIZES = ${safeJsonForInlineScript(presetSizes)};
    var SNAPSHOT_PRESET_SIZES = ${safeJsonForInlineScript(snapshotPresetSizes)};
    var NETWORK_OPTIONS = ${safeJsonForInlineScript(networkOptions)};
    var NETWORK_SNAPSHOTS = ${safeJsonForInlineScript(modularSnapshotOptionsByChain)};
    var LATEST_SNAPSHOTS_BY_NETWORK = ${safeJsonForInlineScript(latestSnapshotsByChain)};
    var SNAPSHOT_HISTORY_PAGE_SIZE = ${SNAPSHOT_HISTORY_PAGE_SIZE};
    var SNAPSHOT_HISTORY_HAS_MORE = {};
    Object.keys(NETWORK_SNAPSHOTS).forEach(function(chainId) {
      SNAPSHOT_HISTORY_HAS_MORE[chainId] = (NETWORK_SNAPSHOTS[chainId] || []).length >= SNAPSHOT_HISTORY_PAGE_SIZE;
    });
    var snapshotHistoryLoadingChainId = null;
    var activeChainId = ${safeJsonForInlineScript(selectedChainId)};
    var latestModularSnapshotId = ${safeJsonForInlineScript(latestModular?.snapshotId || null)};
    var COMPONENTS = [
      { id: 'state',     name: 'state',              desc: 'Tempo MDBX state database',           color: 'var(--disk-state)',     required: true },
      { id: 'headers',   name: 'headers',            desc: 'Tempo block headers',                 color: 'var(--disk-headers)',   required: true },
      { id: 'txs',       name: 'transactions',       desc: 'Tempo transaction history',           color: 'var(--disk-txs)',       required: false },
      { id: 'tx_send',   name: 'senders',            desc: 'Recovered transaction sender data',   color: 'var(--disk-tx-send)',   required: false },
      { id: 'receipts',  name: 'receipts',           desc: 'Transaction receipts and logs',       color: 'var(--disk-receipts)',  required: false },
      { id: 'acc_cs',    name: 'state history',      desc: 'Account and storage changesets',      color: 'var(--disk-acc-cs)',    required: false, group: ['acc_cs', 'sto_cs'] },
      { id: 'sto_cs',    name: 'storage changesets', desc: 'Storage changeset history',           color: 'var(--disk-sto-cs)',    required: false, groupedUnder: 'acc_cs' },
      { id: 'indices',   name: 'indices',            desc: 'Archive indices for lookup and history', color: 'var(--disk-indices)', required: false }
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
    var CUSTOM_COMPONENT_SELECTION_ENABLED = false;

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

    function fmtPresetSize(gb) {
      if (gb >= 1000) return (gb / 1000).toFixed(2) + ' TB';
      return gb.toFixed(2) + ' GB';
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
        var isDisabled = !CUSTOM_COMPONENT_SELECTION_ENABLED || isRequired || (c.id === 'indices' && !isIndicesAvailable()) || (c.id === 'tx_send' && !isSendersAvailable());
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
        var selectedClass = isChecked ? '' : ' not-selected';
        legendHtml += '<div class="disk-legend-item' + selectedClass + '" data-comp="' + c.id + '" onmouseenter="highlightSegment(\\'' + c.id + '\\')" onmouseleave="clearHighlight()">' +
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

    function updateHistoryButton() {
      var button = document.getElementById('loadOlderSnapshots');
      if (!button) return;

      var snapshots = getSnapshotsForActiveNetwork();
      var loading = snapshotHistoryLoadingChainId === activeChainId;
      var hasMore = !!SNAPSHOT_HISTORY_HAS_MORE[activeChainId];
      button.style.display = snapshots.length && (hasMore || loading) ? '' : 'none';
      button.disabled = loading || !hasMore;
      button.textContent = loading ? 'Loading...' : 'Load older';
    }

    function appendLoadedSnapshots(chainId, snapshots) {
      if (!NETWORK_SNAPSHOTS[chainId]) NETWORK_SNAPSHOTS[chainId] = [];
      var existing = new Set(NETWORK_SNAPSHOTS[chainId].map(function(snapshot) {
        return snapshot.snapshotId;
      }));

      snapshots.forEach(function(snapshot) {
        if (snapshot.presetSizes) {
          SNAPSHOT_PRESET_SIZES[snapshot.snapshotId] = snapshot.presetSizes;
          delete snapshot.presetSizes;
        }
        if (!existing.has(snapshot.snapshotId)) {
          NETWORK_SNAPSHOTS[chainId].push(snapshot);
          existing.add(snapshot.snapshotId);
        }
      });

      NETWORK_SNAPSHOTS[chainId].sort(function(a, b) {
        return b.block - a.block || parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10);
      });
    }

    async function loadOlderSnapshots() {
      if (snapshotHistoryLoadingChainId) return;

      var chainId = activeChainId;
      var snapshots = NETWORK_SNAPSHOTS[chainId] || [];
      var lastSnapshot = snapshots[snapshots.length - 1];
      if (!lastSnapshot || !SNAPSHOT_HISTORY_HAS_MORE[chainId]) return;

      snapshotHistoryLoadingChainId = chainId;
      updateHistoryButton();

      try {
        var params = new URLSearchParams({
          chainId: chainId,
          beforeBlock: String(lastSnapshot.block),
          limit: String(SNAPSHOT_HISTORY_PAGE_SIZE)
        });
        var response = await fetch('/api/snapshots/history?' + params.toString());
        if (!response.ok) throw new Error('Failed to load snapshot history');

        var data = await response.json();
        var nextSnapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
        appendLoadedSnapshots(chainId, nextSnapshots);
        SNAPSHOT_HISTORY_HAS_MORE[chainId] = !!data.hasMore && nextSnapshots.length > 0;

        if (chainId === activeChainId) {
          updateSnapshotOptions();
          configureSnapshot(activeSnapshotId, { preserveScroll: true });
        }
      } catch (_err) {
        SNAPSHOT_HISTORY_HAS_MORE[chainId] = true;
      } finally {
        snapshotHistoryLoadingChainId = null;
        updateHistoryButton();
      }
    }

    function updateSnapshotOptions() {
      var select = document.getElementById('snapshotSelect');
      var snapshots = getSnapshotsForActiveNetwork();

      if (!snapshots.length) {
        select.innerHTML = '<option value="">No modular snapshots yet</option>';
        select.disabled = true;
        updateHistoryButton();
        return;
      }

      select.disabled = false;
      select.innerHTML = snapshots.map(function(snapshot, index) {
        var selected = snapshot.snapshotId === activeSnapshotId ? ' selected' : '';
        return '<option value="' + snapshot.snapshotId + '"' + selected + '>' + formatSnapshotOption(snapshot, index) + '</option>';
      }).join('');
      updateHistoryButton();
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
        status.textContent = 'No modular snapshot is available for ' + networkName + ' yet. The command above falls back to the latest archive from ' + latestSnapshot.date + '.';
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
      if (name !== 'archive') return;
      activePreset = name;
      checkedComponents = new Set(PRESETS[name].checked);
      presetBaseComponents = new Set(PRESETS[name].checked);
      COMPONENTS.forEach(function(c) { if (c.required) checkedComponents.add(c.id); });
      renderAll();
    }

    function toggleComponent(id) {
      if (!CUSTOM_COMPONENT_SELECTION_ENABLED) return;
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
        if (el) el.textContent = total > 0 ? '~' + fmtPresetSize(total) : '';
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
