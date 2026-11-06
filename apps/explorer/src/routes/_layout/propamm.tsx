import { createFileRoute, redirect } from '@tanstack/react-router'
import { legacyMarketsSearch, legacySearch } from '#lib/markets'

/** The PropAMM list moved to Markets, filtered to PropAMM. */
export const Route = createFileRoute('/_layout/propamm')({
	validateSearch: legacySearch,
	beforeLoad: ({ search }) => {
		throw redirect({
			to: '/markets',
			search: legacyMarketsSearch('propamm', search),
			replace: true,
		})
	},
})
