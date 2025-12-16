import { createFileRoute, notFound } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { type AddressSection, AddressPageContent } from '../$address'

const validSections = ['assets', 'contract'] as const

export const Route = createFileRoute('/_layout/address/$address/$section')({
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
	return <AddressPageContent section={section as AddressSection} />
}
