import { createFileRoute, redirect } from '@tanstack/react-router'
import { legacyMarketsSearch, legacySearch } from '#lib/markets'

/** The Stablecoin DEX list moved to Markets, filtered to the DEX. */
export const Route = createFileRoute('/_layout/dex/')({
	validateSearch: legacySearch,
	beforeLoad: ({ search }) => {
		throw redirect({
			to: '/markets',
			search: legacyMarketsSearch('dex', search),
			replace: true,
		})
	},
})
