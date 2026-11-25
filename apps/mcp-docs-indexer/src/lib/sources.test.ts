import { describe, expect, it } from 'vitest'
import {
	parseSources,
	resolveSourcePageUrl,
	sourceIndexUrl,
} from './sources.js'

const base = 'https://tempo.com/developers'

describe('source URLs', () => {
	it('preserves the base prefix and fetches its index', () => {
		const [source] = parseSources([{ id: 'tempo', base: `${base}/` }])
		expect(source.base).toBe(base)
		expect(sourceIndexUrl(source)).toBe(`${base}/llms.txt`)
		expect(sourceIndexUrl({ ...source, indexPath: '/' })).toBe(`${base}/`)
	})

	it.each([
		`${base}/docs/api/api-keys`,
		'https://docs.tempo.xyz/docs/api/api-keys',
		'https://tempo.xyz/developers/docs/api/api-keys',
		'https://www.tempo.com/developers/docs/api/api-keys',
		'/developers/docs/api/api-keys',
		'/docs/api/api-keys',
		'docs/api/api-keys',
	])('resolves %s to the canonical docs URL', (raw) => {
		expect(resolveSourcePageUrl(raw, base)?.toString()).toBe(
			`${base}/docs/api/api-keys`,
		)
	})

	it.each([
		'https://tempo.com/admin',
		'https://tempo.xyz/admin',
		'https://tempo.com/developers-other/docs',
		'https://tempo.xyz/developers-other/docs',
		'https://tempo.com/developers/../admin',
		'https://tempo.xyz/developers/../admin',
		'https://example.com/developers/docs',
		'//example.com/docs',
		'http://docs.tempo.xyz/docs/api/api-keys',
	])('rejects %s outside the source scope', (raw) => {
		expect(resolveSourcePageUrl(raw, base)).toBeUndefined()
	})
})
