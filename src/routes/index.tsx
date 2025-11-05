import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
	component: App,
	beforeLoad: () => {
		throw redirect({ to: '/explore' })
	},
})

function App() {
	return null
}
