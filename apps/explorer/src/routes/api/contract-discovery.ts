import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { discoverContractGraph } from '#lib/server/contract-discovery'
import { zAddress } from '#lib/zod'

export const Route = createFileRoute('/api/contract-discovery')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url)
					const address = zAddress().parse(url.searchParams.get('address'))
					const graph = await discoverContractGraph(Address.checksum(address))
					return Response.json(graph, {
						headers: { 'Cache-Control': 'public, max-age=300' },
					})
				} catch (error) {
					return Response.json(
						{
							error:
								error instanceof Error ? error.message : 'Discovery failed',
						},
						{ status: 400 },
					)
				}
			},
		},
	},
})
