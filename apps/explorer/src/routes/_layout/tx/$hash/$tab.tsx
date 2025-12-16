import { createFileRoute, notFound } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { type TxTab, TxPageContent } from '../$hash'

const validTabs = ['calls', 'events', 'changes', 'raw'] as const

export const Route = createFileRoute('/_layout/tx/$hash/$tab')({
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
	return <TxPageContent tab={tab as TxTab} />
}
