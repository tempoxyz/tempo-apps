import { TanStackDevtools } from '@tanstack/react-devtools'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import * as React from 'react'
import { I18nextProvider } from 'react-i18next'
import { deserialize, type State, WagmiProvider } from 'wagmi'
import { getWagmiConfig, getWagmiStateSSR } from '#wagmi.config'
import i18n from '#lib/i18n'
import css from './styles.css?url'

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient
}>()({
	loader: () => getWagmiStateSSR(),
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'Tempo' },
			{ property: 'og:title', content: 'Tempo' },
			{
				name: 'description',
				content:
					'View your balances, send tokens, and track activity on Tempo – the fastest Ethereum L2.',
			},
			{
				property: 'og:description',
				content:
					'View your balances, send tokens, and track activity on Tempo – the fastest Ethereum L2.',
			},
			{
				property: 'og:image',
				content: 'https://app.devnet.tempo.xyz/og-image.png',
			},
			{ property: 'og:image:width', content: '1200' },
			{ property: 'og:image:height', content: '630' },
			{ name: 'twitter:card', content: 'summary_large_image' },
			{
				name: 'twitter:image',
				content: 'https://app.devnet.tempo.xyz/og-image.png',
			},
		],
		links: [
			// Preload critical fonts to prevent FOUC
			{
				rel: 'preload',
				href: '/fonts/PilatTest-Regular.otf',
				as: 'font',
				type: 'font/otf',
				crossOrigin: 'anonymous',
			},
			{
				rel: 'preload',
				href: '/fonts/PilatTest-Demi.otf',
				as: 'font',
				type: 'font/otf',
				crossOrigin: 'anonymous',
			},
			{
				rel: 'preload',
				href: '/fonts/SourceSerif4-Light.woff2',
				as: 'font',
				type: 'font/woff2',
				crossOrigin: 'anonymous',
			},
			{ rel: 'stylesheet', href: css },
			{
				rel: 'icon',
				type: 'image/svg+xml',
				href: '/favicon-light.svg',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'icon',
				type: 'image/svg+xml',
				href: '/favicon-dark.svg',
				media: '(prefers-color-scheme: dark)',
			},
		],
	}),
	component: RootComponent,
})

function RootComponent() {
	const { queryClient } = Route.useRouteContext()
	const [config] = React.useState(() => getWagmiConfig())
	const wagmiState = Route.useLoaderData({ select: deserialize<State> })

	return (
		<html lang="en" className="scheme-light-dark scrollbar-gutter-stable">
			<head>
				<HeadContent />
			</head>
			<body className="antialiased">
				<I18nextProvider i18n={i18n}>
					<WagmiProvider config={config} initialState={wagmiState}>
						<QueryClientProvider client={queryClient}>
							<Outlet />
							{import.meta.env.MODE === 'development' &&
								import.meta.env.VITE_ENABLE_DEVTOOLS === 'true' && (
									<TanStackDevtools
										config={{ position: 'bottom-right' }}
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
						</QueryClientProvider>
					</WagmiProvider>
				</I18nextProvider>
				<Scripts />
			</body>
		</html>
	)
}
