import { createFileRoute } from '@tanstack/react-router'
import { Address } from 'ox'
import * as z from 'zod/mini'

import {
	DEFAULT_LIMIT,
	fetchAccountTransactions,
	MAX_LIMIT,
	SearchParamsSchema,
} from '#server/account/fetch-account-transactions.ts'

export const Route = createFileRoute('/api/account/$address')({
	beforeLoad: async ({ search, params }) => {
		const { address } = params
		const { offset, limit, include, sort } = search

		if (limit > MAX_LIMIT) throw new Error('Limit is too high')

		return { address, offset, limit, include, sort }
	},
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const address = params.address.toLowerCase() as Address.Address
				const url = new URL(request.url)
				const searchParams = SearchParamsSchema.safeParse(
					Object.fromEntries(url.searchParams.entries()),
				)
				if (!searchParams.success)
					throw new Error(z.prettifyError(searchParams.error), {
						cause: 'Invalid search params',
					})

				const offset = Math.max(0, searchParams.data.offset)
				const limit = searchParams.data.limit

				try {
					const result = await fetchAccountTransactions({
						data: {
							address,
							offset,
							limit,
							include: searchParams.data.include,
							sort: searchParams.data.sort,
						},
					})

					const cacheControl =
						offset === 0
							? 'public, max-age=0, must-revalidate'
							: 'public, max-age=3600, stale-while-revalidate=86400'

					return Response.json(result, {
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': cacheControl,
						},
					})
				} catch (error) {
					console.error('API Error:', error)
					return Response.json(
						{
							error:
								error instanceof Error
									? error.message
									: 'Failed to fetch transactions',
						},
						{ status: 500 },
					)
				}
			},
		},
	},
	params: z.object({
		address: z.pipe(
			z.string(),
			z.transform((x) => {
				Address.assert(x)
				return x
			}),
		),
	}),
	validateSearch: z.object({
		offset: z.prefault(z.coerce.number(), 0),
		limit: z.prefault(z.coerce.number(), DEFAULT_LIMIT),
		include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
		sort: z.prefault(z.enum(['asc', 'desc']), 'desc'),
	}),
})
