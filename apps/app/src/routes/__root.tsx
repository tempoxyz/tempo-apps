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
import { deserialize, type State, WagmiProvider } from 'wagmi'
import { getWagmiConfig, getWagmiStateSSR } from '#wagmi.config'
import css from './styles.css?url'

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient
}>()({
	loader: () => getWagmiStateSSR(),
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'App ⋅ Tempo' },
			{ name: 'og:title', content: 'App ⋅ Tempo' },
			{ name: 'description', content: 'Tempo App' },
			{ name: 'og:description', content: 'Tempo App' },
		],
		links: [
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
				<WagmiProvider config={config} initialState={wagmiState}>
					<QueryClientProvider client={queryClient}>
						<Outlet />
						{import.meta.env.MODE === 'development' &&
							import.meta.env.VITE_ENABLE_DEVTOOLS === 'true' && (
								<TanStackDevtools
									config={{ position: 'bottom-right' }}
									plugins={[
										{ name: 'Tanstack Query', render: <ReactQueryDevtools /> },
										{
											name: 'Tanstack Router',
											render: <TanStackRouterDevtoolsPanel />,
										},
									]}
								/>
							)}
					</QueryClientProvider>
				</WagmiProvider>
				<Scripts />
			</body>
		</html>
	)
}
