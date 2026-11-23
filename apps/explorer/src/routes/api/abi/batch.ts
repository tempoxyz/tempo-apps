import { createFileRoute } from '@tanstack/react-router'
import type { Address, Hex } from 'viem'
import * as z from 'zod/mini'
import { autoloadAbi, lookupSignature } from '#lib/domain/contracts'

export const BatchAbiRequestSchema = z.object({
	addresses: z
		.array(z.string().check(z.regex(/^0x[0-9a-fA-F]{40}$/)))
		.check(z.maxLength(50)),
	selectors: z
		.array(z.string().check(z.regex(/^0x(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{64})$/)))
		.check(z.maxLength(50)),
})

export const Route = createFileRoute('/api/abi/batch')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await readBatchBody(request)
					const { addresses, selectors } = BatchAbiRequestSchema.parse(body)

					if (addresses.length + selectors.length > 50)
						return Response.json({ error: 'Too many lookups' }, { status: 400 })

					// Deduplicate inputs
					const uniqueAddresses = [
						...new Set(addresses.map((value) => value.toLowerCase())),
					] as Address[]
					const uniqueSelectors = [
						...new Set(selectors.map((value) => value.toLowerCase())),
					] as Hex[]

					// Fetch all ABIs and signatures in parallel
					const [abiResults, signatureResults] = await Promise.all([
						mapLimit(uniqueAddresses, 3, async (address) => {
							try {
								const abi = await autoloadAbi(address, {
									resolveSignatures: false,
								})
								return [address.toLowerCase(), abi] as const
							} catch {
								return [address.toLowerCase(), null] as const
							}
						}),
						mapLimit(uniqueSelectors, 3, async (selector) => {
							try {
								const signature = await lookupSignature(selector)
								return [selector.toLowerCase(), signature] as const
							} catch {
								return [selector.toLowerCase(), null] as const
							}
						}),
					])

					const abis = Object.fromEntries(abiResults)
					const signatures = Object.fromEntries(signatureResults)

					return Response.json(
						{ abis, signatures },
						{
							headers: {
								'Cache-Control':
									'public, max-age=86400, stale-while-revalidate=604800',
							},
						},
					)
				} catch (error) {
					console.error('Batch ABI lookup error:', error)
					return Response.json({ error: 'Invalid request' }, { status: 400 })
				}
			},
		},
	},
})

export type BatchAbiResponse = {
	abis: Record<string, Awaited<ReturnType<typeof autoloadAbi>>>
	signatures: Record<string, string | null>
}

async function readBatchBody(request: Request): Promise<unknown> {
	const limit = 16 * 1024
	if (Number(request.headers.get('content-length')) > limit)
		throw new Error('Request too large')
	const reader = request.body?.getReader()
	if (!reader) throw new Error('Missing body')
	const bytes = new Uint8Array(limit)
	let size = 0
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			if (size + value.byteLength > limit) throw new Error('Request too large')
			bytes.set(value, size)
			size += value.byteLength
		}
		return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)))
	} finally {
		await reader.cancel()
		reader.releaseLock()
	}
}

async function mapLimit<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let next = 0
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const index = next++
				results[index] = await fn(items[index] as T)
			}
		}),
	)
	return results
}
