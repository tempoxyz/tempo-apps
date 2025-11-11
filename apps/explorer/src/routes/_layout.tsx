import { createFileRoute, Outlet } from '@tanstack/react-router'
import * as z from 'zod/mini'

import { Header } from '#components/Header'
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
			<footer className="bg-system py-6">
				<ul className="flex items-center justify-center gap-6 text-sm text-secondary">
					<li>
						<a
							href="https://tempo.xyz"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-primary transition-colors"
						>
							About
						</a>
					</li>
					<li>
						<a
							href="https://docs.tempo.xyz"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-content-primary transition-colors"
						>
							Documentation
						</a>
					</li>
					<li>
						<a
							href="https://github.com/tempoxyz"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-primary transition-colors"
						>
							GitHub
						</a>
					</li>
				</ul>
			</footer>
		</main>
	)
}
