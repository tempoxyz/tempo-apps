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

export function resolveLegacyTokenTab(
	tab: string | undefined,
	isTip20: boolean,
	account?: string,
): AddressTab {
	// Unqualified token links open configuration; account-filtered links are
	// transfer drill-downs and must retain their existing destination.
	if (tab === undefined && isTip20 && !account) return 'token'
	if (tab === 'holders' || tab === 'token' || tab === 'contract') return tab
	if (tab === 'interact') return 'contract'
	return 'transfers'
}

export function resolveContractHashTab(hash: string): 'contract' | 'interact' {
	return hash.startsWith('source-file-') ||
		new URLSearchParams(hash).has('source')
		? 'contract'
		: 'interact'
}
