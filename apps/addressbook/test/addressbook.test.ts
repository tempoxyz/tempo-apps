import { env, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

const address = '0x0000000000000000000000000000000000000001'

afterEach(async () => {
	const keys = await env.ADDRESSBOOK.list()
	await Promise.all(keys.keys.map((key) => env.ADDRESSBOOK.delete(key.name)))
})

describe('addressbook', () => {
	it('resolves public labels without authentication', async () => {
		await createLabel({
			address,
			label: 'Tempo System',
			visibility: 'public',
			source: 'tempo',
		})

		const response = await SELF.fetch('https://addressbook.test/resolve', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ addresses: [address] }),
		})

		const body = await response.json()

		expect(response.status).toBe(200)
		expect(body.labels[address].label).toBe('Tempo System')
		expect(body.labels[address].visibility).toBe('public')
	})

	it('keeps private and group labels out of unauthenticated responses', async () => {
		await createLabel({ address, label: 'Public', visibility: 'public' })
		await createLabel({ address, label: 'Private', visibility: 'private' })
		await createLabel({
			address,
			label: 'Treasury',
			visibility: 'group',
			groupId: 'finance',
		})

		const response = await SELF.fetch('https://addressbook.test/resolve', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ addresses: [address] }),
		})
		const body = await response.json()

		expect(body.labels[address].label).toBe('Public')
		expect(body.labels[address].visibility).toBe('public')
	})

	it('prefers private labels over group and public labels', async () => {
		await createLabel({ address, label: 'Public', visibility: 'public' })
		await createLabel({
			address,
			label: 'Team Treasury',
			visibility: 'group',
			groupId: 'finance',
		})
		await createLabel({ address, label: 'My Treasury', visibility: 'private' })

		const response = await resolve([address])
		const body = await response.json()

		expect(body.labels[address].label).toBe('My Treasury')
		expect(body.labels[address].visibility).toBe('private')
	})

	it('rejects group labels when the account is not in the group', async () => {
		const response = await SELF.fetch('https://addressbook.test/labels', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Tempo-Account': JSON.stringify({
					userId: 'user_1',
					groupIds: ['engineering'],
				}),
			},
			body: JSON.stringify({
				address,
				label: 'Finance Treasury',
				visibility: 'group',
				groupId: 'finance',
			}),
		})

		expect(response.status).toBe(403)
	})
})

async function createLabel(body: Record<string, unknown>) {
	const response = await SELF.fetch('https://addressbook.test/labels', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Tempo-Account': JSON.stringify({
				userId: 'user_1',
				groupIds: ['finance'],
			}),
		},
		body: JSON.stringify(body),
	})

	expect(response.status).toBe(201)
}

function resolve(addresses: string[]) {
	return SELF.fetch('https://addressbook.test/resolve', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Tempo-Account': JSON.stringify({
				userId: 'user_1',
				groupIds: ['finance'],
			}),
		},
		body: JSON.stringify({ addresses }),
	})
}
