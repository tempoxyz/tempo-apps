import { createFileRoute, notFound } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { type AddressTab, AddressPageContent } from '../$address'

const validTabs = ['assets', 'contract'] as const

export const Route = createFileRoute('/_layout/address/$address/$tab')({
	component: RouteComponent,
	params: z.object({
		tab: z.enum(validTabs),
	}),
	onError: () => {
		throw notFound()
	},
})

function RouteComponent() {
	const { tab } = Route.useParams()
	return <AddressPageContent tab={tab as AddressTab} />
}
