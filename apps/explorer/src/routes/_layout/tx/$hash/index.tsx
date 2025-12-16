import { createFileRoute } from '@tanstack/react-router'
import { TxPageContent } from '../$hash'

export const Route = createFileRoute('/_layout/tx/$hash/')({
	component: RouteComponent,
})

function RouteComponent() {
	return <TxPageContent tab="overview" />
}
