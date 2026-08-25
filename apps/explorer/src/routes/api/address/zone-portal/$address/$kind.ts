import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import type { ZonePortalActivityResponse } from '#lib/domain/zones'
import { getRequestURL } from '#lib/env'
import { fetchZonePortalActivity } from '#lib/server/zone-portal'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const SearchSchema = z.object({
	page: z.prefault(z.coerce.number(), 1),
	limit: z.prefault(z.coerce.number(), 10),
})

const KindSchema = z.enum(['deposits', 'withdrawals', 'batches'])

export const Route = createFileRoute('/api/address/zone-portal/$address/$kind')(
	{
		server: {
			handlers: {
				GET: async ({ params }) => {
					try {
						const address = zAddress().parse(params.address)
						const kind = KindSchema.parse(params.kind)
						const search = SearchSchema.parse(
							Object.fromEntries(getRequestURL().searchParams),
						)
						const page = Math.max(1, Math.floor(search.page))
						const limit = Math.min(10, Math.max(1, Math.floor(search.limit)))
						const response = await fetchZonePortalActivity({
							address,
							chainId: getChainId(getWagmiConfig()),
							kind,
							page,
							limit,
						})
						return Response.json(response satisfies ZonePortalActivityResponse)
					} catch (error) {
						console.error(error)
						return Response.json(
							{
								error:
									error instanceof Error
										? error.message
										: 'Failed to load Zone Portal activity',
							},
							{ status: 500 },
						)
					}
				},
			},
		},
	},
)
