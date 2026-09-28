import { createFileRoute, redirect } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as z from 'zod/mini'
import { resolveLegacyTokenTab } from '#lib/domain/address-tabs'
import { isTip20Address } from '#lib/domain/tip20'

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

		const tab = resolveLegacyTokenTab(
			search.tab,
			isTip20Address(address),
			search.a,
		)

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
