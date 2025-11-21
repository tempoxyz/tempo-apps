import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod/mini'
import { zAddress } from '#lib/zod'
import { fetchTokenMetadata } from '#server/token/fetch-token-metadata'

export const Route = createFileRoute('/api/token/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const { address } = params

				const metadata = await fetchTokenMetadata({
					data: { address },
				})

				return Response.json(metadata, {
					headers: {
						'Content-Type': 'application/json',
						'Cache-Control':
							'public, max-age=3600, stale-while-revalidate=86400',
					},
				})
			},
		},
	},
	params: {
		parse: z.object({
			address: zAddress(),
		}).parse,
	},
})
