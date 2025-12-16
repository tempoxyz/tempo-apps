import { createFileRoute, notFound } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { type TokenTab, TokenPageContent } from '../$address'

const validTabs = ['holders', 'contract'] as const

export const Route = createFileRoute('/_layout/token/$address/$tab')({
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
	return <TokenPageContent tab={tab as TokenTab} />
}
