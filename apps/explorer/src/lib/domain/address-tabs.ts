import { z } from 'zod/mini'

const allTabs = [
	'deposits',
	'withdrawals',
	'batches',
	'transactions',
	'holdings',
	'transfers',
	'holders',
	'token',
	'contract',
	'interact',
] as const

export type AddressTab = (typeof allTabs)[number]

// Preserve an absent tab so the address type can supply its default.
export const addressTabSchema = z.optional(
	z.pipe(
		z.string(),
		z.transform((value): AddressTab => {
			if (value === 'history') return 'transactions'
			if (value === 'assets') return 'holdings'
			return allTabs.includes(value as AddressTab)
				? (value as AddressTab)
				: 'transactions'
		}),
	),
)

export function resolveAddressTab(
	tab: AddressTab | undefined,
	isTip20: boolean,
): AddressTab {
	return tab ?? (isTip20 ? 'token' : 'transactions')
}
