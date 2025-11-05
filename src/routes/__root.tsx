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
			<body>
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
