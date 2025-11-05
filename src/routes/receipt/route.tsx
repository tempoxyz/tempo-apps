import { createFileRoute, Outlet } from '@tanstack/react-router'
import { z } from 'zod/mini'
import { Layout } from '#explore/route.tsx'
import css from '#explore/styles.css?url'

// `/receipt` inherits `/explore` app layout + styles
export const Route = createFileRoute('/receipt')({
	component: Component,
	head: () => ({
		links: [
			{
				rel: 'stylesheet',
				href: css,
			},
		],
	}),
	validateSearch: z.object({
		plain: z.optional(z.string()),
	}).parse,
})

function Component() {
	const search = Route.useSearch()
	if ('plain' in search) return <Outlet />
	return <Layout />
}
