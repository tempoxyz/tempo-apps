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
	return (
		<>
			<header className="pl-16 pt-12 flex items-center gap-2">
				<img src="/icons/watermark.svg" alt="Tempo" className="w-26" />
			</header>
			<Outlet />
			<footer className="fixed bottom-0 left-0 right-0 bg-background-primary p-4 pb-10">
				<ul className="flex items-center justify-center gap-4 text-[#7B7B7B] text-base *:hover:text-white transition-colors">
					<li>
						<a
							href="https://tempo.xyz"
							target="_blank"
							rel="noopener noreferrer"
						>
							About
						</a>
					</li>
					<li>
						<a
							href="https://docs.tempo.xyz"
							target="_blank"
							rel="noopener noreferrer"
						>
							Documentation
						</a>
					</li>
					<li>
						<a
							href="https://github.com/tempoxyz"
							target="_blank"
							rel="noopener noreferrer"
						>
							GitHub
						</a>
					</li>
				</ul>
			</footer>
		</>
	)
}
