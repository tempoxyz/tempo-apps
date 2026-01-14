import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Intro } from '#comps/Intro'
import { Layout } from '#comps/Layout'

export const Route = createFileRoute('/_layout')({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<Layout>
			<Layout.Hero>
				<Intro />
			</Layout.Hero>
			<Layout.Content>
				<Outlet />
			</Layout.Content>
		</Layout>
	)
}
