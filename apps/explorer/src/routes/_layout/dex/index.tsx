import { createFileRoute, redirect } from '@tanstack/react-router'
import { defaultDexRoute } from '#lib/dex-route'

export const Route = createFileRoute('/_layout/dex/')({
	beforeLoad: () => {
		throw redirect({
			to: '/dex/$from/$to',
			params: { from: defaultDexRoute.from, to: defaultDexRoute.to },
		})
	},
	component: () => null,
})
