import { createFileRoute, redirect } from '@tanstack/react-router'

/** Earn vault pages now live under Vaults. */
export const Route = createFileRoute('/_layout/earn/$vault')({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/vaults/$vault',
			params: { vault: params.vault as `0x${string}` },
			statusCode: 301,
		})
	},
})
