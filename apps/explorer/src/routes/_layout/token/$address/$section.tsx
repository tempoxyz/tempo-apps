import { createFileRoute, notFound } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { type TokenSection, TokenPageContent } from '../$address'

const validSections = ['holders', 'contract'] as const

export const Route = createFileRoute('/_layout/token/$address/$section')({
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
	return <TokenPageContent section={section as TokenSection} />
}
