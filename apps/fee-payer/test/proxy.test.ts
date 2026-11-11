import { env, exports } from 'cloudflare:workers'
import { tempo, tempoModerato } from 'viem/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	forward,
	maxBodyBytes,
	parseLegacyKeys,
	readConfig,
	resolveApiKey,
} from '../src/lib/proxy.js'

const legacyKey = 'tp_orthogonal'
const apiKey = 'tempo:sk:proxy'

function rpc(
	path: string,
	body: unknown = { jsonrpc: '2.0', id: 1, method: 'eth_chainId' },
) {
	return new Request(`https://sponsor.test${path}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			cookie: 'session=1',
			'tempo-api-key': 'tempo:sk:client-supplied',
		},
		body: JSON.stringify(body),
	})
}

function stubUpstream() {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(async () =>
			Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' }),
		)
}

function withEnv(values: Record<string, string>) {
	for (const [key, value] of Object.entries(values))
		Reflect.set(env, key, value)
	return () => {
		for (const key of Object.keys(values)) Reflect.deleteProperty(env, key)
	}
}

afterEach(() => vi.restoreAllMocks())

describe('readConfig', () => {
	it('pins the chain from TEMPO_ENV', () => {
		expect(readConfig({ TEMPO_ENV: 'mainnet' }).chainId).toBe(tempo.id)
		expect(readConfig({ TEMPO_ENV: 'moderato' }).chainId).toBe(tempoModerato.id)
	})

	it('sponsors anyone only off mainnet', () => {
		const config = readConfig({
			TEMPO_ENV: 'mainnet',
			TEMPO_API_KEY: apiKey,
		})
		expect(config.publicSponsorship).toBe(false)
		expect(resolveApiKey(config, undefined)).toMatchObject({
			ok: false,
			status: 401,
		})
	})

	it('keeps only tp_ keys from the legacy list', () => {
		expect(parseLegacyKeys(' tp_a, b ,tp_ ,,tp_c ')).toEqual(
			new Set(['tp_a', 'tp_c']),
		)
		expect(parseLegacyKeys(undefined).size).toBe(0)
	})
})

describe('resolveApiKey', () => {
	const mainnet = readConfig({
		TEMPO_ENV: 'mainnet',
		TEMPO_API_KEY: apiKey,
		TEMPO_LEGACY_KEYS: legacyKey,
	})
	const testnet = readConfig({
		TEMPO_ENV: 'moderato',
		TEMPO_API_KEY: apiKey,
	})

	it('sponsors a listed legacy key with the proxy key', () => {
		expect(resolveApiKey(mainnet, legacyKey)).toEqual({ ok: true, apiKey })
	})

	it('refuses unknown and missing keys on mainnet', () => {
		expect(resolveApiKey(mainnet, 'tp_unknown')).toEqual({
			ok: false,
			error: 'Invalid or revoked API key',
			status: 401,
		})
		expect(resolveApiKey(mainnet, undefined)).toEqual({
			ok: false,
			error: 'API key required',
			status: 401,
		})
	})

	it('sponsors any testnet request', () => {
		expect(resolveApiKey(testnet, undefined)).toEqual({ ok: true, apiKey })
		expect(resolveApiKey(testnet, 'tp_whatever')).toEqual({ ok: true, apiKey })
	})

	it('fails closed without TEMPO_API_KEY', () => {
		const config = readConfig({
			TEMPO_ENV: 'mainnet',
			TEMPO_LEGACY_KEYS: legacyKey,
		})
		expect(resolveApiKey(config, legacyKey)).toMatchObject({
			ok: false,
			status: 503,
		})
	})
})

describe('forward', () => {
	it('sends only the body, with the proxy key, to the pinned chain', async () => {
		const upstream = stubUpstream()
		const response = await forward(rpc('/'), {
			apiKey,
			chainId: tempo.id,
		})
		expect(response.status).toBe(200)
		const [url, init] = upstream.mock.calls[0] ?? []
		expect(url).toBe(`https://api.tempo.xyz/rpc/sponsor/${tempo.id}`)
		const headers = new Headers(init?.headers)
		expect(headers.get('tempo-api-key')).toBe(apiKey)
		expect(headers.get('cookie')).toBeNull()
		expect(
			JSON.parse(new TextDecoder().decode(init?.body as ArrayBuffer)),
		).toMatchObject({
			method: 'eth_chainId',
		})
	})

	it('rejects oversized bodies without calling upstream', async () => {
		const upstream = stubUpstream()
		const response = await forward(
			new Request('https://sponsor.test/', {
				method: 'POST',
				body: 'x'.repeat(maxBodyBytes + 1),
			}),
			{ apiKey, chainId: tempo.id },
		)
		expect(response.status).toBe(413)
		expect(upstream).not.toHaveBeenCalled()
	})
})

describe('worker routes', () => {
	it('serves the testnet open path through Tempo API', async () => {
		const upstream = stubUpstream()
		const restore = withEnv({
			TEMPO_API_KEY: apiKey,
		})
		try {
			const response = await exports.default.fetch(rpc('/'))
			expect(response.status).toBe(200)
			await expect(response.json()).resolves.toMatchObject({ result: '0x1' })
			const [url, init] = upstream.mock.calls[0] ?? []
			expect(url).toBe(`https://api.tempo.xyz/rpc/sponsor/${tempoModerato.id}`)
			expect(new Headers(init?.headers).get('tempo-api-key')).toBe(apiKey)
		} finally {
			restore()
		}
	})

	it('refuses unlisted keys on mainnet', async () => {
		const upstream = stubUpstream()
		const restore = withEnv({ TEMPO_API_KEY: apiKey, TEMPO_ENV: 'mainnet' })
		try {
			const response = await exports.default.fetch(rpc('/tp_unknown'))
			expect(response.status).toBe(401)
			expect(upstream).not.toHaveBeenCalled()
		} finally {
			restore()
		}
	})
})
