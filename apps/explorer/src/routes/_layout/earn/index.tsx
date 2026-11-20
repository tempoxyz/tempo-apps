import { createFileRoute, redirect } from '@tanstack/react-router'

/** The Earn list now lives in Vaults, filtered to Earn vaults. */
export const Route = createFileRoute('/_layout/earn/')({
	beforeLoad: () => {
		throw redirect({ to: '/vaults', search: { kind: 'earn' }, statusCode: 301 })
	},
})
