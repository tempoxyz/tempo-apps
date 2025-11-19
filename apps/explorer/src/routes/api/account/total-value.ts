import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/mini'

import { zAddress } from '#lib/zod'
import { fetchAccountTotalValue } from '#server/account/fetch-account-total-value.ts'

export const Route = createFileRoute('/api/account/total-value')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const result = await fetchAccountTotalValue({
						data: { address: params.address },
					})
					return Response.json(result, { status: 200 })
				} catch (error) {
					console.error('Failed to fetch total value', error)
					return Response.json(
						{
							error:
								error instanceof Error
									? error.message
									: 'Failed to fetch total value',
						},
						{ status: 500 },
					)
				}
			},
		},
	},
	params: {
		parse: z.object({
			address: zAddress(),
		}).parse,
	},
})
