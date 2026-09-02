import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { mainnetApiKeyMiddleware } from './mainnet-api-key-middleware.js'

function createApp(tempoEnv: string) {
	const app = new Hono()
	app.use(mainnetApiKeyMiddleware({ tempoEnv }))
	app.get('/', (c) => c.json({ result: 'sponsored' }))
	return app
}

describe('mainnet API key requirement', () => {
	it('rejects anonymous mainnet sponsorship requests', async () => {
		const response = await createApp('mainnet').request('/')

		expect(response.status).toBe(401)
		expect(await response.json()).toEqual({ error: 'API key required' })
	})

	it.each([
		'testnet',
		'moderato',
		'devnet',
		'localnet',
	])('preserves anonymous %s sponsorship', async (tempoEnv) => {
		const response = await createApp(tempoEnv).request('/')

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ result: 'sponsored' })
	})
})
