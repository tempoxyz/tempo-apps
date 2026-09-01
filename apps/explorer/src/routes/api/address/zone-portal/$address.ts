import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import type { ZonePortalOverview } from '#lib/domain/zones'
import { fetchZonePortalOverview } from '#lib/server/zone-portal'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

export const Route = createFileRoute('/api/address/zone-portal/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const address = zAddress().parse(params.address)
					const response = await fetchZonePortalOverview({
						address,
						chainId: getChainId(getWagmiConfig()),
					})
					return Response.json(response satisfies ZonePortalOverview)
				} catch (error) {
					console.error(error)
					return Response.json(
						{
							error:
								error instanceof Error
									? error.message
									: 'Failed to load Zone Portal',
						},
						{ status: 500 },
					)
				}
			},
		},
	},
})
