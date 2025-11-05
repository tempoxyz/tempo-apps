import { TanStackDevtools } from '@tanstack/react-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'
import { WagmiProvider } from 'wagmi'
import { config, persister, queryClient } from '../wagmi.config'
import css from './styles.css?url'

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: 'Tempo',
			},
		],
		links: [
			{
				rel: 'stylesheet',
				href: css,
			},
		],
	}),
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	useShortcuts()

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="antialiased">
				<header className="pl-16 pt-12 flex items-center gap-2">
					<img src="/icons/watermark.svg" alt="Tempo" className="w-26" />
				</header>
				<WagmiProvider config={config}>
					<PersistQueryClientProvider
						client={queryClient}
						persistOptions={{ persister }}
					>
						{children}
					</PersistQueryClientProvider>
				</WagmiProvider>
				{import.meta.env.DEV && (
					<TanStackDevtools
						config={{
							position: 'bottom-right',
						}}
						plugins={[
							{
								name: 'Tanstack Router',
								render: <TanStackRouterDevtoolsPanel />,
							},
						]}
					/>
				)}
				<Scripts />
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
			</body>
		</html>
	)
}

let theme: 'light' | 'dark' | undefined

function useShortcuts() {
	useEffect(() => {
		const handleKeyPress = (e: KeyboardEvent) => {
			// ⌘ + 1 = color scheme toggle
			if ((e.metaKey || e.ctrlKey) && e.key === '1') {
				e.preventDefault()
				theme ??= window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'
				document.documentElement.classList.toggle(
					'scheme-light!',
					theme === 'dark',
				)
				document.documentElement.classList.toggle(
					'scheme-dark!',
					theme === 'light',
				)
				theme = theme === 'dark' ? 'light' : 'dark'
			}
		}

		window.addEventListener('keydown', handleKeyPress)
		return () => window.removeEventListener('keydown', handleKeyPress)
	}, [])
}
