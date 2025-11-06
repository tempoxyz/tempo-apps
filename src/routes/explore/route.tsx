import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Header } from './-components/header.tsx'
import css from './styles.css?url'

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

export function Layout() {
	return (
		<main className="flex min-h-dvh flex-col">
			<Header />
			<Outlet />
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
