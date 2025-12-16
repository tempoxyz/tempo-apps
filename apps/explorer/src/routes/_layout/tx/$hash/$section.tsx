import { createFileRoute, notFound } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { type TxSection, TxPageContent } from '../$hash'

const validSections = ['calls', 'events', 'changes', 'raw'] as const

export const Route = createFileRoute('/_layout/tx/$hash/$section')({
	component: RouteComponent,
	params: z.object({
		section: z.enum(validSections),
	}),
	onError: () => {
		throw notFound()
	},
})

function RouteComponent() {
	const { section } = Route.useParams()
	return <TxPageContent section={section as TxSection} />
}
