import { afterEach, it, expect, vi } from 'vitest'
vi.mock('wrangler', () => ({
	unstable_readConfig: () => ({
		vars: {
			AI_SEARCH_INSTANCE_ID: 'shared',
			SOURCES: [
				{ id: 'a', base: 'https://a.example', instanceId: 'new-a' },
				{ id: 'b', base: 'https://b.example', instanceId: 'new-b' },
				{ id: 'c', base: 'https://c.example', instanceId: 'new-a' },
			],
		},
	}),
}))
vi.mock('node:fs/promises', () => ({
	readFile: async () =>
		JSON.stringify([{ field_name: 'source', data_type: 'text' }]),
}))
afterEach(() => {
	vi.unstubAllGlobals()
	vi.unstubAllEnvs()
	vi.restoreAllMocks()
})
it.each([
	undefined,
	'explicit',
])('configures unique destinations or explicit override %s', async (override) => {
	vi.resetModules()
	vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account')
	vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token')
	vi.stubEnv('AI_SEARCH_INSTANCE_ID', override)
	vi.stubEnv('AI_SEARCH_NAMESPACE', 'default')
	vi.spyOn(console, 'info').mockImplementation(() => {})
	const fetchMock = vi.fn(
		async () => new Response(JSON.stringify({ success: true })),
	)
	vi.stubGlobal('fetch', fetchMock)
	await import('../../scripts/configure-ai-search-metadata.js')
	expect(
		fetchMock.mock.calls.map((args) => String(args[0]).split('/').at(-1)),
	).toEqual(override ? ['explicit'] : ['shared', 'new-a', 'new-b'])
})
