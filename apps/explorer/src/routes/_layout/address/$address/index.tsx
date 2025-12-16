import { createFileRoute } from '@tanstack/react-router'
import { AddressPageContent } from '../$address'

export const Route = createFileRoute('/_layout/address/$address/')({
	component: RouteComponent,
})

function RouteComponent() {
	return <AddressPageContent tab="history" />
}
