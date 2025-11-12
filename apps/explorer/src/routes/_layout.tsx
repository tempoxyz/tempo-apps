import { createFileRoute, Outlet } from '@tanstack/react-router'
import * as z from 'zod/mini'
import { Footer } from '#components/Footer.tsx'
import { Header } from '#components/Header.tsx'
import css from './styles.css?url'

export const Route = createFileRoute('/_layout')({
	head: () => ({
		links: [
			{
				rel: 'stylesheet',
				href: css,
			},
		],
	}),
	component: Component,
	validateSearch: z.object({
		plain: z.optional(z.string()),
	}).parse,
})

function Component() {
	const search = Route.useSearch()
	if ('plain' in search) return <Outlet />
	return (
		<Layout>
			<Outlet />
		</Layout>
	)
}

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-dvh flex-col">
			<Header />
			{children}
			<Footer />
		</main>
	)
}
