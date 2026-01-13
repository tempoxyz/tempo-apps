import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import * as z from 'zod/mini'
import { zAddress } from '#lib/zod'

export type OgStatsApiResponse = {
	holders: { count: number; isExact: boolean } | null
	created: string | null
}

const FetchOgStatsInputSchema = z.object({
	address: zAddress({ lowercase: true }),
})

export const fetchOgStats = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchOgStatsInputSchema.parse(input))
	.handler(async ({ data }) => {
		const { fetchOgStatsImpl } = await import('./token.server.ts')
		return fetchOgStatsImpl(data.address as Address.Address)
	})
