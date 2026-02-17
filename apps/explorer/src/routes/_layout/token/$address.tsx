import { createFileRoute, redirect } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as z from 'zod/mini'

export const Route = createFileRoute('/_layout/token/$address')({
	validateSearch: z.object({
		page: z.optional(z.number()),
		limit: z.optional(z.number()),
		tab: z.optional(z.string()),
		a: z.optional(z.string()),
	}),
	beforeLoad: ({ params, search }) => {
		const { address } = params
		if (!Address.validate(address)) {
			throw redirect({
				to: '/address/$address',
				params: { address },
			})
		}

		// Map old tab names to new ones
		let tab: string = 'transfers'
		if (search.tab === 'holders') tab = 'holders'
		else if (search.tab === 'contract') tab = 'contract'
		else if (search.tab === 'interact') tab = 'interact'

		throw redirect({
			to: '/address/$address',
			params: { address },
			search: {
				tab,
				...(search.page ? { page: search.page } : {}),
				...(search.limit ? { limit: search.limit } : {}),
				...(search.a ? { a: search.a } : {}),
			},
		})
	},
	component: () => null,
})
