import { beforeEach, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => ({ abi: vi.fn(), signature: vi.fn() }))
vi.mock('#lib/domain/contracts', () => ({
	autoloadAbi: lookup.abi,
	lookupSignature: lookup.signature,
}))
import { Route } from '#routes/api/abi/batch'

const handler = (
	Route as unknown as {
		options: {
			server: {
				handlers: { POST: (context: { request: Request }) => Promise<Response> }
			}
		}
	}
).options.server.handlers.POST
const call = (body: unknown) =>
	handler({
		request: new Request('https://explore.tempo.xyz/api/abi/batch', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body),
		}),
	})
beforeEach(() => {
	vi.clearAllMocks()
	lookup.abi.mockResolvedValue(null)
	lookup.signature.mockResolvedValue(null)
})

it.each([
	{ addresses: ['bad'], selectors: [] },
	{ addresses: [], selectors: ['0x123'] },
	{ addresses: [], selectors: Array(51).fill('0x12345678') },
	' '.repeat(16385),
])('rejects invalid or excessive input before upstream lookups', async (body) => {
	expect((await call(body)).status).toBe(400)
	expect(lookup.abi).not.toHaveBeenCalled()
	expect(lookup.signature).not.toHaveBeenCalled()
})

it('deduplicates case variants and bounds concurrent lookup work', async () => {
	let active = 0
	let peak = 0
	lookup.signature.mockImplementation(async () => {
		active++
		peak = Math.max(peak, active)
		await new Promise((resolve) => setTimeout(resolve, 1))
		active--
		return null
	})
	const selectors = Array.from(
		{ length: 12 },
		(_, i) => `0x${i.toString(16).padStart(8, '0')}`,
	)
	expect(
		(await call({ addresses: [], selectors: [...selectors, '0x0000000B'] }))
			.status,
	).toBe(200)
	expect(lookup.signature).toHaveBeenCalledTimes(12)
	expect(peak).toBeLessThanOrEqual(3)
})
