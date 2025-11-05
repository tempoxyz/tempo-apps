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
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1, maximum-scale=1',
			},
		],
		links: [
			{
				rel: 'stylesheet',
				href: css,
			},
			{
				rel: 'icon',
				href: '/favicon.ico',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon/favicon-16x16.png',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon/favicon-16x16-dark.png',
				media: '(prefers-color-scheme: dark)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon/favicon-32x32.png',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon/favicon-32x32-dark.png',
				media: '(prefers-color-scheme: dark)',
			},
			{
				rel: 'apple-touch-icon',
				sizes: '192x192',
				href: '/favicon/android-chrome-192x192.png',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'apple-touch-icon',
				sizes: '192x192',
				href: '/favicon/android-chrome-192x192-dark.png',
				media: '(prefers-color-scheme: dark)',
			},
		],
	}),
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	useDevTools()

	return (
		<html lang="en" className="scheme-light-dark">
			<head>
				<HeadContent />
			</head>
			<body className="antialiased">
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

function useDevTools() {
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

	useEffect(() => {
		if (
			import.meta.env.MODE === 'development' &&
			import.meta.env.VITE_ENABLE_ERUDA === 'true'
		) {
			void import('eruda').then(({ default: eruda }) => eruda.init())
		}
	}, [])
}
