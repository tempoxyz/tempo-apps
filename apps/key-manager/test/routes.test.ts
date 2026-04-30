import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('key manager WebAuthn routes', () => {
	it('serves register options on the route used by wagmi/tempo', async () => {
		const response = await exports.default.fetch(
			new Request('https://keys.test/register/options', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					origin: 'https://tempo.xyz',
				},
				body: JSON.stringify({ name: 'alice' }),
			}),
		)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			options?: {
				publicKey?: {
					challenge?: string
					rp?: { id?: string; name?: string }
					user?: { name?: string }
				}
			}
		}

		expect(body.options?.publicKey?.challenge).toEqual(expect.any(String))
		expect(body.options?.publicKey?.rp).toEqual({
			id: 'tempo.xyz',
			name: 'tempo.xyz',
		})
		expect(body.options?.publicKey?.user?.name).toBe('alice')
	})

	it('does not expose the legacy challenge route', async () => {
		const response = await exports.default.fetch(
			new Request('https://keys.test/challenge'),
		)

		expect(response.status).toBe(404)
	})
})
