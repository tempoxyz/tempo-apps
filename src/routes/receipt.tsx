import { createFileRoute, Outlet } from '@tanstack/react-router'
import css from './receipt/styles.css?url'

export const Route = createFileRoute('/receipt')({
	component: () => <Outlet />,
	head: () => ({
		links: [
			{
				rel: 'stylesheet',
				href: css,
			},
		],
	}),
})
