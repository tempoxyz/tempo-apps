import { createFileRoute } from '@tanstack/react-router'
import type { Address, Hex } from 'viem'
import * as z from 'zod/mini'
import { autoloadAbi, lookupSignature } from '#lib/domain/contracts'

const BatchAbiRequestSchema = z.object({
	addresses: z.array(z.string()),
	selectors: z.array(z.string()),
})

export const Route = createFileRoute('/api/abi/batch')({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = await request.json()
					const { addresses, selectors } = BatchAbiRequestSchema.parse(body)

					// Deduplicate inputs
					const uniqueAddresses = [...new Set(addresses)] as Address[]
					const uniqueSelectors = [...new Set(selectors)] as Hex[]

					// Fetch all ABIs and signatures in parallel
					const [abiResults, signatureResults] = await Promise.all([
						Promise.all(
							uniqueAddresses.map(async (address) => {
								try {
									const abi = await autoloadAbi(address)
									return [address.toLowerCase(), abi] as const
								} catch {
									return [address.toLowerCase(), null] as const
								}
							}),
						),
						Promise.all(
							uniqueSelectors.map(async (selector) => {
								try {
									const signature = await lookupSignature(selector)
									return [selector.toLowerCase(), signature] as const
								} catch {
									return [selector.toLowerCase(), null] as const
								}
							}),
						),
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
