import { describe, expect, it } from 'vitest'
import { checkRateLimit, clientKey } from '../src/lib/server/rate-limit'

const allow = { limit: async () => ({ success: true }) }
const deny = { limit: async () => ({ success: false }) }

function request(ip?: string, asn?: number) {
	return new Request('https://explore.testnet.tempo.xyz/tx/0x123', {
		...(ip === undefined ? {} : { headers: { 'cf-connecting-ip': ip } }),
		...(asn === undefined ? {} : { cf: { asn } }),
	})
}

describe('clientKey', () => {
	it('keys ipv4 clients by address', () => {
		expect(clientKey(request('203.0.113.7'))).toBe('203.0.113.7')
	})

	it('buckets ipv6 clients by /64 prefix', () => {
		expect([
			clientKey(request('2001:db8:abcd:12::1')),
			clientKey(request('2001:db8:abcd:12:ffff:ffff:ffff:ffff')),
			clientKey(request('2001:db8:abcd:12:1234::5')),
			clientKey(request('2001:0db8:abcd:0012::1')),
		]).toEqual([
			'2001:db8:abcd:12',
			'2001:db8:abcd:12',
			'2001:db8:abcd:12',
			'2001:db8:abcd:12',
		])
	})

	it('separates distinct /64 prefixes', () => {
		expect(clientKey(request('2001:db8:abcd:13::1'))).not.toBe(
			clientKey(request('2001:db8:abcd:12::1')),
		)
	})

	it('expands leading ::', () => {
		expect(clientKey(request('::1'))).toBe('0:0:0:0')
	})

	it('falls back when the header is missing', () => {
		expect(clientKey(request())).toBe('unknown')
	})
})

describe('checkRateLimit', () => {
	it('allows when all limiters allow', async () => {
		const response = await checkRateLimit(request('203.0.113.7', 64512), {
			asn: allow,
			global: allow,
			ip: allow,
		})
		expect(response).toBeUndefined()
	})

	it('rejects when any limiter denies', async () => {
		const responses = await Promise.all([
			checkRateLimit(request('203.0.113.7', 64512), { asn: deny, ip: allow }),
			checkRateLimit(request('203.0.113.7'), { global: deny, ip: allow }),
			checkRateLimit(request('203.0.113.7'), { ip: deny }),
		])
		expect(
			responses.map((response) => ({
				retryAfter: response?.headers.get('retry-after'),
				status: response?.status,
			})),
		).toEqual([
			{ retryAfter: '10', status: 429 },
			{ retryAfter: '10', status: 429 },
			{ retryAfter: '10', status: 429 },
		])
	})

	it('keys each limiter separately', async () => {
		const keys: string[] = []
		const recording = {
			limit: async ({ key }: { key: string }) => {
				keys.push(key)
				return { success: true }
			},
		}
		await checkRateLimit(request('2001:db8:abcd:12::1', 64512), {
			asn: recording,
			global: recording,
			ip: recording,
		})
		expect(keys).toEqual(['2001:db8:abcd:12', 'asn:64512', 'global'])
	})

	it('skips the asn limiter when asn is unavailable', async () => {
		const response = await checkRateLimit(request('203.0.113.7'), {
			asn: deny,
			ip: allow,
		})
		expect(response).toBeUndefined()
	})

	it('fails open without bindings', async () => {
		expect(await checkRateLimit(request('203.0.113.7'), {})).toBeUndefined()
	})

	it('fails open when a limiter throws', async () => {
		const throwing = {
			limit: async (): Promise<{ success: boolean }> => {
				throw new Error('unavailable')
			},
		}
		expect(
			await checkRateLimit(request('203.0.113.7'), { ip: throwing }),
		).toBeUndefined()
	})
})
