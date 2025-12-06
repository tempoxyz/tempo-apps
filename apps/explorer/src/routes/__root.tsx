import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'
import { WagmiProvider } from 'wagmi'
import { ErrorBoundary } from '#components/ui/ErrorBoundary'
import { ProgressLine } from '#components/ui/ProgressLine'
import { config, persister, queryClient } from '#wagmi.config'
import css from './styles.css?url'

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient
}>()({
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
				title: 'Tempo Explorer',
			},
			{
				name: 'og:title',
				content: 'Tempo Explorer',
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
	errorComponent: (props) => (
		<RootDocument>
			<ErrorBoundary {...props} />
		</RootDocument>
	),
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	useDevTools()

	const isLoading = useRouterState({
		select: (state) => state.status === 'pending',
	})

	return (
		<html lang="en" className="scheme-light-dark">
			<head>
				<HeadContent />
			</head>
			<body className="antialiased">
				<ProgressLine
					loading={isLoading}
					start={800}
					className="fixed top-0 left-0 right-0 z-1"
				/>
				<WagmiProvider config={config}>
					<PersistQueryClientProvider
						client={queryClient}
						persistOptions={{ persister }}
					>
						{children}
						{import.meta.env.DEV && (
							<TanStackDevtools
								config={{
									position: 'bottom-right',
								}}
								plugins={[
									{
										name: 'Tanstack Query',
										render: <ReactQueryDevtools />,
									},
									{
										name: 'Tanstack Router',
										render: <TanStackRouterDevtoolsPanel />,
									},
								]}
							/>
						)}
					</PersistQueryClientProvider>
				</WagmiProvider>
				<Scripts />
			</body>
		</html>
	)
}

let theme: 'light' | 'dark' | undefined

function useDevTools() {
	useEffect(() => {
		if (import.meta.env.VITE_ENABLE_COLOR_SCHEME_TOGGLE !== 'true') return
		const handleKeyPress = (e: KeyboardEvent) => {
			if (
				// ⌘ + 1 = color scheme toggle
				((e.metaKey || e.ctrlKey) && e.key === '1') ||
				// ⌥ + 1 = color scheme toggle  (Safari)
				(e.altKey && e.code === 'Digit1')
			) {
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
			import.meta.env.VITE_ENABLE_DEVTOOLS !== 'false'
		) {
			void import('eruda').then(({ default: eruda }) => eruda.init())
		}
	}, [])
}
