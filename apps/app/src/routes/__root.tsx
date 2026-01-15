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
import { I18nextProvider, useTranslation } from 'react-i18next'
import { deserialize, type State, WagmiProvider } from 'wagmi'
import { getWagmiConfig, getWagmiStateSSR } from '#wagmi.config'
import { CommandMenuProvider } from '#comps/CommandMenu'
import { AnnouncerProvider, SkipLink } from '#lib/a11y'
import i18n, { isRtl } from '#lib/i18n'
import css from './styles.css?url'

const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV
const OG_IMAGE_URL =
	TEMPO_ENV === 'moderato'
		? 'https://app.tempo.xyz/og-image.png'
		: TEMPO_ENV === 'devnet'
			? 'https://app.devnet.tempo.xyz/og-image.png'
			: 'https://app.mainnet.tempo.xyz/og-image.png'

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
				content: OG_IMAGE_URL,
			},
			{ property: 'og:image:width', content: '1200' },
			{ property: 'og:image:height', content: '630' },
			{ name: 'twitter:card', content: 'summary_large_image' },
			{
				name: 'twitter:image',
				content: OG_IMAGE_URL,
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
		<I18nextProvider i18n={i18n}>
			<RootDocument
				queryClient={queryClient}
				config={config}
				wagmiState={wagmiState}
			/>
		</I18nextProvider>
	)
}

function RootDocument({
	queryClient,
	config,
	wagmiState,
}: {
	queryClient: QueryClient
	config: ReturnType<typeof getWagmiConfig>
	wagmiState: State | undefined
}) {
	const { i18n: i18nInstance } = useTranslation()
	const lang = i18nInstance.language
	const dir = isRtl(lang) ? 'rtl' : 'ltr'

	return (
		<html
			lang={lang}
			dir={dir}
			className="scheme-light-dark scrollbar-gutter-stable"
		>
			<head>
				<HeadContent />
			</head>
			<body className="antialiased">
				<SkipLink />
				<WagmiProvider config={config} initialState={wagmiState}>
					<QueryClientProvider client={queryClient}>
						<AnnouncerProvider>
							<CommandMenuProvider>
								<Outlet />
							</CommandMenuProvider>
						</AnnouncerProvider>
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
				<Scripts />
			</body>
		</html>
	)
}
