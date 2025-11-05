import { createFileRoute } from '@tanstack/react-router'
import { Layout } from './explore'
import css from './explore/styles.css?url'

// `/receipt` inherits `/explore` app layout + styles
export const Route = createFileRoute('/receipt')({
	component: () => <Layout />,
	head: () => ({
		links: [
			{
				rel: 'stylesheet',
				href: css,
			},
		],
	}),
})
