import { createFileRoute, Outlet } from '@tanstack/react-router'
import css from './explore/styles.css?url'

export const Route = createFileRoute('/explore')({
	head: () => ({
		links: [
			{
				rel: 'stylesheet',
				href: css,
			},
		],
	}),
	component: () => <Layout />,
})

// TODO: search bar, bg, footer, etc
export function Layout() {
	return <Outlet />
}
