import { createFileRoute } from '@tanstack/react-router'
import { TokenPageContent } from '../$address'

export const Route = createFileRoute('/_layout/token/$address/')({
	component: RouteComponent,
})

function RouteComponent() {
	return <TokenPageContent section="transfers" />
}
