import { Window } from 'happy-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

const R2_PUBLIC_URL = 'https://r2.example'
const ORIGIN = 'https://snapshots.tempo.xyz'
const INJECTED_OPTION = 'v1</option><option value="ghost" selected>Injected'

// In-memory stand-in for the R2 bucket binding: just enough of get, head,
// put and list for the viewer.
class FakeBucket {
	objects = new Map<string, string>()

	set(key: string, value: unknown): void {
		this.objects.set(
			key,
			typeof value === 'string' ? value : JSON.stringify(value),
		)
	}

	async get(key: string) {
		const value = this.objects.get(key)
		if (value === undefined) return null
		return {
			key,
			size: value.length,
			json: async () => JSON.parse(value),
			text: async () => value,
		}
	}

	async head(key: string) {
		const value = this.objects.get(key)
		return value === undefined ? null : { key, size: value.length }
	}

	async put(key: string, value: string) {
		this.objects.set(key, value)
	}

	async list(options: { prefix?: string; delimiter?: string } = {}) {
		const prefix = options.prefix ?? ''
		const prefixes = new Set<string>()
		const objects: { key: string; size: number }[] = []
		for (const [key, value] of this.objects) {
			if (!key.startsWith(prefix)) continue
			const rest = key.slice(prefix.length)
			const cut = options.delimiter ? rest.indexOf(options.delimiter) : -1
			if (cut >= 0) prefixes.add(prefix + rest.slice(0, cut + 1))
			else objects.push({ key, size: value.length })
		}
		return {
			objects,
			delimitedPrefixes: [...prefixes],
			truncated: false,
		}
	}
}

function addModularSnapshot(
	bucket: FakeBucket,
	dir: string,
	manifest: Record<string, unknown>,
): void {
	bucket.set(`${dir}/manifest.json`, {
		storage_version: 2,
		components: { state: { file: 'state.tar.zst', size: 1_000_000_000 } },
		...manifest,
	})
	bucket.set(`${dir}/state.tar.zst`, 'archive')
}

function indexEntry(overrides: Record<string, unknown>) {
	const manifestUrl = `${R2_PUBLIC_URL}/tempo-4217-100-1700000000/manifest.json`
	return {
		snapshotId: manifestUrl,
		chainId: '4217',
		networkKey: 'mainnet',
		networkName: 'Mainnet',
		block: 100,
		timestamp: '1700000000',
		date: '2023-11-14',
		image: 'v1.0.0',
		archiveUrl: manifestUrl,
		archiveFile: 'tempo-4217-100-1700000000/manifest.json',
		metadataUrl: manifestUrl,
		size: 1,
		isModular: true,
		components: [],
		manifestUrl,
		manifestKey: 'tempo-4217-100-1700000000/manifest.json',
		presetSizes: {
			minimal: { state: 1 },
			full: { state: 1 },
			archive: { state: 1 },
		},
		...overrides,
	}
}

function setIndex(bucket: FakeBucket, snapshots: unknown[]): void {
	bucket.set('_index.json', {
		version: 2,
		generatedAt: '2026-11-24T00:00:00.000Z',
		snapshots,
	})
}

async function request(bucket: FakeBucket, path: string): Promise<Response> {
	return worker.fetch(new Request(`${ORIGIN}${path}`), {
		SNAPSHOTS: bucket,
		R2_PUBLIC_URL,
	} as never)
}

// Renders the landing page and runs its inline script in a DOM.
async function renderPage(bucket: FakeBucket) {
	const html = await (await request(bucket, '/')).text()
	const window = new Window({
		url: `${ORIGIN}/`,
		settings: {
			enableJavaScriptEvaluation: true,
			disableJavaScriptFileLoading: true,
			disableCSSFileLoading: true,
		},
	})
	const errors: unknown[] = []
	window.addEventListener('error', (event) =>
		errors.push((event as unknown as { error: unknown }).error),
	)
	window.document.write(html)
	await window.happyDOM.waitUntilComplete()
	const document = window.document
	const options = (id: string) =>
		[...document.querySelectorAll(`#${id} option`)].map((option) => ({
			value: option.getAttribute('value'),
			text: option.textContent,
		}))
	return {
		html,
		errors,
		footer: document.querySelector('.footer')?.innerHTML ?? '',
		networkOptions: options('networkSelect'),
		snapshotOptions: options('snapshotSelect'),
		close: () => window.happyDOM.close(),
	}
}

beforeEach(() => {
	vi.stubGlobal('caches', {
		default: { match: async () => undefined, put: async () => {} },
	})
	vi.spyOn(console, 'warn').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe('footer block number', () => {
	it('drops an index entry whose block is not a number', async () => {
		const bucket = new FakeBucket()
		setIndex(bucket, [indexEntry({ block: '<img src=x onerror=alert(1)>' })])

		const html = await (await request(bucket, '/')).text()

		expect(html).not.toContain('<img src=x')
		expect(html).toContain('Latest snapshot: block — · —')
	})

	it('skips a manifest whose block is not a number', async () => {
		const bucket = new FakeBucket()
		addModularSnapshot(bucket, 'tempo-4217-100-1700000000', {
			chain_id: 4217,
			block: '<script>alert(1)</script>',
			timestamp: 1700000000,
		})

		const html = await (await request(bucket, '/')).text()
		const api = await (await request(bucket, '/api/snapshots')).json()

		expect(html).not.toContain('<script>alert(1)</script>')
		expect(api).toEqual([])
	})

	it('renders a valid block number', async () => {
		const bucket = new FakeBucket()
		addModularSnapshot(bucket, 'tempo-4217-1234567-1700000000', {
			chain_id: 4217,
			block: 1234567,
			timestamp: 1700000000,
		})

		const html = await (await request(bucket, '/')).text()

		expect(html).toContain('Latest snapshot: block 1,234,567 ·')
	})
})

describe('snapshot selector', () => {
	it('shows manifest version text as text, not markup', async () => {
		const bucket = new FakeBucket()
		addModularSnapshot(bucket, 'tempo-4217-100-1700000000', {
			chain_id: 4217,
			block: 100,
			timestamp: 1700000000,
			tempo_version: INJECTED_OPTION,
		})

		const page = await renderPage(bucket)
		page.close()

		expect(page.errors).toEqual([])
		expect(page.snapshotOptions).toHaveLength(1)
		expect(page.snapshotOptions[0]?.text).toContain(INJECTED_OPTION)
		expect(page.snapshotOptions.map((o) => o.value)).not.toContain('ghost')
	})

	it('keeps index snapshot ids, dates and images as text', async () => {
		const bucket = new FakeBucket()
		setIndex(bucket, [
			indexEntry({
				snapshotId: 'x"><option value="ghost">Ghost</option><option value="',
				date: '<b>2023</b>',
				image: INJECTED_OPTION,
			}),
		])

		const page = await renderPage(bucket)
		page.close()

		expect(page.errors).toEqual([])
		expect(page.snapshotOptions).toEqual([
			{
				value: 'x"><option value="ghost">Ghost</option><option value="',
				text: `Latest · <b>2023</b> · ${INJECTED_OPTION}`,
			},
		])
	})
})

describe('network selector', () => {
	it('drops index entries whose chain id is not a decimal string', async () => {
		const bucket = new FakeBucket()
		setIndex(bucket, [
			indexEntry({}),
			indexEntry({
				chainId: '1"><option value="evil">Evil</option><option value="2',
				snapshotId: 'other',
			}),
		])

		const page = await renderPage(bucket)
		page.close()

		expect(page.errors).toEqual([])
		expect(page.networkOptions).toEqual([{ value: '4217', text: 'Mainnet' }])
	})

	it('skips a manifest whose chain id differs from its directory name', async () => {
		const bucket = new FakeBucket()
		addModularSnapshot(bucket, 'tempo-4217-100-1700000000', {
			chain_id: 4217,
			block: 100,
			timestamp: 1700000000,
		})
		addModularSnapshot(bucket, 'tempo-5-100-1700000001', {
			chain_id: '5"><option value="evil">Evil</option><option value="5',
			block: 100,
			timestamp: 1700000001,
		})

		const page = await renderPage(bucket)
		page.close()

		expect(page.errors).toEqual([])
		expect(page.networkOptions).toEqual([{ value: '4217', text: 'Mainnet' }])
	})

	it('skips legacy metadata whose chain id is not a decimal string', async () => {
		const bucket = new FakeBucket()
		bucket.set('tempo-7-100-1700000000.json', {
			chain_id: '7"><option value="evil">Evil</option><option value="7',
			block: 100,
			timestamp: '1700000000',
			archive: 'tempo-7-100-1700000000.tar.lz4',
		})
		bucket.set('tempo-7-100-1700000000.tar.lz4', 'archive')
		bucket.set('tempo-8-100-1700000000.json', {
			chain_id: '8',
			block: 100,
			timestamp: '1700000000',
			archive: 'tempo-8-100-1700000000.tar.lz4',
		})
		bucket.set('tempo-8-100-1700000000.tar.lz4', 'archive')

		const page = await renderPage(bucket)
		page.close()

		expect(page.errors).toEqual([])
		expect(page.networkOptions).toEqual([
			{ value: '8', text: 'Chain 8 · legacy only' },
		])
	})
})

describe('published data', () => {
	it('keeps legacy snapshots whose block is a decimal string', async () => {
		const bucket = new FakeBucket()
		bucket.set('tempo-4217-50639520-1795550571.json', {
			chain_id: '4217',
			block: '50639520',
			timestamp: '1795550571',
			image: 'ghcr.io/tempoxyz/tempo:sha-a9d6748',
			archive: 'tempo-4217-50639520-1795550571.tar.lz4',
		})
		bucket.set('tempo-4217-50639520-1795550571.tar.lz4', 'archive')

		const api = await (await request(bucket, '/api/snapshots')).json()

		expect(api).toMatchObject([
			{ chainId: '4217', block: '50639520', isModular: false },
		])
	})

	it('accepts the index entries production serves today', async () => {
		const bucket = new FakeBucket()
		setIndex(bucket, [
			indexEntry({}),
			indexEntry({
				snapshotId: 'legacy',
				block: '50639520',
				isModular: false,
				presetSizes: undefined,
			}),
		])

		const api = await (await request(bucket, '/api/snapshots')).json()

		expect(api).toHaveLength(2)
	})
})
