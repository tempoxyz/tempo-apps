import { describe, expect, it } from 'vitest'
import { canonicalInbox, clientBucket } from '../src/lib/rate-limit-keys.ts'
import { codeFrom, createClient, uniqueIp } from './helpers.ts'

const audience = 'https://merchant.example'

describe('canonicalInbox', () => {
	it.each([
		['victim@gmail.com', 'victim@gmail.com'],
		['victim+1@gmail.com', 'victim@gmail.com'],
		['v.ic.tim@gmail.com', 'victim@gmail.com'],
		['v.ictim+promo@googlemail.com', 'victim@gmail.com'],
		['alice+tag@example.com', 'alice@example.com'],
		['a.lice@example.com', 'a.lice@example.com'],
		['alice+a+b@example.com', 'alice@example.com'],
		['+tag@example.com', '+tag@example.com'],
	])('%s -> %s', (email, inbox) => {
		expect(canonicalInbox(email)).toBe(inbox)
	})
})

describe('clientBucket', () => {
	it.each([
		['203.0.113.7', '203.0.113.7'],
		['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
		['2001:0DB8:0001:0002:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
		['2001:db8:1:2::1', '2001:db8:1:2::/64'],
		['2001:db8::1', '2001:db8:0:0::/64'],
		['::1', '0:0:0:0::/64'],
		['fe80::1%eth0', 'fe80:0:0:0::/64'],
		['::ffff:203.0.113.7', '203.0.113.7'],
		['64:ff9b::203.0.113.7', '64:ff9b:0:0::/64'],
		[undefined, 'unknown'],
		['', 'unknown'],
	])('%s -> %s', (ip, bucket) => {
		expect(clientBucket(ip)).toBe(bucket)
	})

	it('keys Workers on other zones by zone, not their shared egress address', () => {
		expect(clientBucket('2a06:98c0:3600::103', 'Shop.Example')).toBe(
			'worker:shop.example',
		)
	})

	it('ignores CF-Worker from addresses outside the Worker egress range', () => {
		expect(clientBucket('203.0.113.7', 'random.example')).toBe('203.0.113.7')
		expect(clientBucket('2001:db8:1:2::1', 'random.example')).toBe(
			'2001:db8:1:2::/64',
		)
		expect(clientBucket(undefined, 'random.example')).toBe('unknown')
	})
})

function send(
	client: ReturnType<typeof createClient>,
	email: string,
	ip = uniqueIp(),
	headers: Record<string, string> = {},
) {
	return client.request(
		'POST',
		'/email/otp',
		{ email, audience },
		{ 'CF-Connecting-IP': ip, ...headers },
	)
}

describe('send rate limit buckets', () => {
	it('puts Gmail aliases of one inbox in one bucket', async () => {
		const client = createClient()
		const ip = uniqueIp()
		const local = `victim${crypto.randomUUID().replace(/-/g, '')}`
		const dotted = `${local.slice(0, 3)}.${local.slice(3)}`
		for (const email of [
			`${local}@gmail.com`,
			`${local}+1@gmail.com`,
			`${dotted}@gmail.com`,
		])
			expect((await send(client, email, ip)).status).toBe(200)
		const response = await send(client, `${dotted}+2@googlemail.com`, ip)
		expect(response.status).toBe(429)
		// Recipients stay the exact addresses requested.
		expect(client.sent.map((email) => email.to)).toEqual([
			`${local}@gmail.com`,
			`${local}+1@gmail.com`,
			`${dotted}@gmail.com`,
		])
	})

	it('puts +tag aliases on any domain in one bucket, but not dotted ones', async () => {
		const client = createClient()
		const ip = uniqueIp()
		const domain = `${crypto.randomUUID()}.example.com`
		for (const tag of ['', '+a', '+b'])
			expect((await send(client, `bob${tag}@${domain}`, ip)).status).toBe(200)
		expect((await send(client, `bob+c@${domain}`, ip)).status).toBe(429)
		expect((await send(client, `b.ob@${domain}`, ip)).status).toBe(200)
	})

	it('keeps the exact address as the attestation subject', async () => {
		const client = createClient()
		const email = `carol+shop@${crypto.randomUUID()}.example.com`
		const response = await send(client, email)
		const { id } = (await response.json()) as { id: string }
		const verified = await client.request('POST', '/email/verify', {
			id,
			code: codeFrom(client.sent[0]),
		})
		const { attestation } = (await verified.json()) as { attestation: string }
		const payload = JSON.parse(
			atob(
				(attestation.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'),
			),
		) as { sub: string }
		expect(payload.sub).toBe(email)
	})

	it('limits IPv6 clients per /64', async () => {
		const client = createClient()
		const hex = () => Math.floor(Math.random() * 0xffff).toString(16)
		const prefix = `2001:db8:${hex()}:${hex()}`
		for (let i = 1; i <= 10; i++) {
			const ip = `${prefix}:${hex()}:${hex()}:${hex()}:${i.toString(16)}`
			const email = `u@${crypto.randomUUID()}.example.com`
			expect((await send(client, email, ip)).status).toBe(200)
		}
		const blocked = await send(
			client,
			`u@${crypto.randomUUID()}.example.com`,
			`${prefix}::beef`,
		)
		expect(blocked.status).toBe(429)
		expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0)
		// Another /64 is a different client.
		const other = await send(
			client,
			`u@${crypto.randomUUID()}.example.com`,
			`2001:db8:${hex()}:${hex()}::1`,
		)
		expect(other.status).toBe(200)
	})

	it('does not cap sends per recipient domain', async () => {
		const client = createClient()
		const domain = `${crypto.randomUUID()}.example.com`
		for (let i = 0; i < 12; i++)
			expect((await send(client, `user${i}@${domain}`)).status).toBe(200)
	})

	it('gives Workers on different zones separate buckets', async () => {
		const client = createClient()
		const egress = '2a06:98c0:3600::103'
		const zone = `${crypto.randomUUID()}.example`
		const fresh = () => `u@${crypto.randomUUID()}.example.com`
		for (let i = 0; i < 10; i++)
			expect(
				(await send(client, fresh(), egress, { 'CF-Worker': zone })).status,
			).toBe(200)
		expect(
			(await send(client, fresh(), egress, { 'CF-Worker': zone })).status,
		).toBe(429)
		expect(
			(await send(client, fresh(), egress, { 'CF-Worker': `other-${zone}` }))
				.status,
		).toBe(200)
	})

	it('does not use up the client quota on requests the inbox limit refuses', async () => {
		const client = createClient()
		const ip = uniqueIp()
		const email = `full@${crypto.randomUUID()}.example.com`
		const fresh = () => `u@${crypto.randomUUID()}.example.com`
		for (let i = 0; i < 3; i++)
			expect((await send(client, email, ip)).status).toBe(200)
		for (let i = 0; i < 5; i++)
			expect((await send(client, email, ip)).status).toBe(429)
		// 3 of the client's 10 sends are used; the 5 refusals did not count.
		for (let i = 0; i < 7; i++)
			expect((await send(client, fresh(), ip)).status).toBe(200)
		expect((await send(client, fresh(), ip)).status).toBe(429)
	})
})
