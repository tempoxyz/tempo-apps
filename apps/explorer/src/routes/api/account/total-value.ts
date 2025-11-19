import { createFileRoute } from '@tanstack/react-router'
import { Address } from 'ox'
import * as z from 'zod/mini'

import { fetchAccountTotalValue } from '#server/account/fetch-account-total-value.ts'

export const Route = createFileRoute('/api/account/total-value')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const address = params.address.toLowerCase() as Address.Address

				try {
					const result = await fetchAccountTotalValue({
						data: { address },
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
			address: z.pipe(
				z.string(),
				z.transform((x) => {
					Address.assert(x)
					return x
				}),
			),
		}).parse,
	},
})
