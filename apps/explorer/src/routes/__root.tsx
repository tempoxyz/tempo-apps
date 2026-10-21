import { TanStackDevtools } from '@tanstack/react-devtools'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { style, Token } from '@tempoxyz/ds'
import * as React from 'react'
import { deserialize, type State, WagmiProvider } from 'wagmi'
import { AddressHighlightProvider } from '#comps/AddressHighlight'
import { ErrorBoundary } from '#comps/ErrorBoundary'
import { Layout } from '#comps/Layout'
import { NotFound } from '#comps/NotFound'
import { TokenListMembershipProvider } from '#comps/TokenListMembership'
import {
	getCanonicalExplorerUrl,
	getExplorerWebApplication,
} from '#lib/explorer-indexing'
import { getRequestURL, getTempoEnv } from '#lib/env'
import { OG_BASE_URL } from '#lib/og'
import { posthogBootScript } from '#lib/posthog'
import { ProgressLine } from '#comps/ProgressLine'
import { defaultThemeMode, themeBootScript } from '#lib/theme'
import {
	getTempoChain,
	getWagmiConfig,
	getWagmiStateSSR,
} from '#wagmi.config.ts'
import geistMono from '@tempoxyz/ds/fonts/GeistMono-Variable.woff2?url'
import inter from '@tempoxyz/ds/fonts/Inter-Variable.woff2?url'

function getCurrentCanonicalExplorerUrl(): string | undefined {
	const pathname =
		typeof window === 'undefined'
			? getRequestURL().pathname
			: window.location.pathname
	return getCanonicalExplorerUrl(getTempoEnv(), pathname)
}

function getExplorerCanonicalLinks() {
	const href = getCurrentCanonicalExplorerUrl()
	return href ? [{ rel: 'canonical', href }] : []
}

function getExplorerRobotsMeta() {
	return getCurrentCanonicalExplorerUrl()
		? []
		: [{ name: 'robots', content: 'noindex, nofollow' }]
}

function getExplorerWebApplicationScripts() {
	const webApplication = getExplorerWebApplication(getTempoEnv())
	return webApplication
		? [
				{
					children: JSON.stringify(webApplication),
					type: 'application/ld+json',
				},
			]
		: []
}

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
				title: 'Explore - Tempo',
			},
			{
				name: 'og:title',
				content: 'Explore - Tempo',
			},
			{
				name: 'description',
				content:
					'Explore and analyze blocks, transactions, contracts and more on Tempo.',
			},
			{
				name: 'og:description',
				content:
					'Explore and analyze blocks, transactions, contracts and more on Tempo.',
			},
			{
				name: 'og:image',
				content: `${OG_BASE_URL}/explorer`,
			},
			{
				name: 'og:image:type',
				content: 'image/webp',
			},
			{
				name: 'og:image:width',
				content: '1200',
			},
			{
				name: 'og:image:height',
				content: '630',
			},
			{
				name: 'twitter:card',
				content: 'summary_large_image',
			},
			{
				name: 'twitter:image',
				content: `${OG_BASE_URL}/explorer`,
			},
			...getExplorerRobotsMeta(),
		],
		links: [
			...getExplorerCanonicalLinks(),
			// The TDS faces: Inter for copy, Geist Mono for hashes and addresses.
			{
				rel: 'preload',
				href: inter,
				as: 'font',
				type: 'font/woff2',
				crossOrigin: 'anonymous',
			},
			{
				rel: 'preload',
				href: geistMono,
				as: 'font',
				type: 'font/woff2',
				crossOrigin: 'anonymous',
			},
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
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon-32x32-light.png',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon-32x32-dark.png',
				media: '(prefers-color-scheme: dark)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon-16x16-light.png',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon-16x16-dark.png',
				media: '(prefers-color-scheme: dark)',
			},
			{
				rel: 'apple-touch-icon',
				sizes: '180x180',
				href: '/favicon-light.png',
			},
		],
		scripts: getExplorerWebApplicationScripts(),
	}),
	scripts: async () => {
		const scripts: Array<{ children: string; type: string }> = []

		// Patch fetch/Request to strip basic auth credentials from same-origin URLs.
		// Required for TanStack Start server functions (/_serverFn/...) which use
		// relative fetches that inherit credentials from the page URL.
		// Always active because browsers hide URL credentials from JS (Location has
		// no username/password, and Chrome strips them from location.href), making
		// detection impossible. The patch is a no-op when no credentials are present.
		scripts.push({
			children:
				'(function(){var o=window.location.protocol+"//"+window.location.host;var F=window.fetch;var R=window.Request;var s=function(i){var u=i instanceof Request?i.url:String(i);try{var a=new URL(u,o);if(a.origin===o){a.username="";a.password="";}return a.href}catch(e){return null}};window.fetch=function(i,n){try{var h=s(i);if(h){if(i instanceof Request)return F.call(this,new R(h,i),n);return F.call(this,h,n)}}catch(e){}return F.call(this,i,n)};var W=function(i,n){var h=s(i);if(h)return new R(h,n||i);return new R(i,n)};W.prototype=R.prototype;window.Request=W;})();',
			type: 'text/javascript',
		})

		// PostHog page views. Deferred so it never blocks the initial render.
		// The key and host are compiled in at build time from VITE_EXPLORER_POSTHOG_KEY and
		// VITE_POSTHOG_HOST. Without them the page loads nothing PostHog related.
		const posthog = posthogBootScript({
			key: import.meta.env.VITE_EXPLORER_POSTHOG_KEY,
			host: import.meta.env.VITE_POSTHOG_HOST,
		})
		if (posthog) scripts.push({ children: posthog, type: 'text/javascript' })

		return scripts
	},
	errorComponent: (props) => (
		<RootDocument>
			<ErrorBoundary {...props} />
		</RootDocument>
	),
	loader: () => getWagmiStateSSR(),
	// An unmatched URL renders here, outside `_layout`, so it brings the layout.
	notFoundComponent: () => (
		<Layout>
			<NotFound />
		</Layout>
	),
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
	useDevTools()

	const { queryClient } = Route.useRouteContext()
	const [config] = React.useState(() => getWagmiConfig())
	const wagmiState = Route.useLoaderData({ select: deserialize<State> })

	const isLoading = useRouterState({
		select: (state) => {
			if (state.status !== 'pending') return false

			const resolvedPathname =
				state.resolvedLocation?.pathname ?? state.location.pathname
			return state.location.pathname !== resolvedPathname
		},
	})

	return (
		<html lang="en" data-theme={defaultThemeMode} suppressHydrationWarning>
			<head>
				<script>{themeBootScript}</script>
				<HeadContent />
			</head>
			<body>
				<ProgressLine
					loading={isLoading}
					start={800}
					className={styles.progress().className}
				/>
				<WagmiProvider config={config} initialState={wagmiState}>
					<QueryClientProvider client={queryClient}>
						<TokenListMembershipProvider>
							<AddressHighlightProvider>
								{/* Token logos come from the explorer's curated logo route. */}
								<Token.Provider
									chainId={getTempoChain().id}
									resolveSrc={resolveTokenLogo}
								>
									{children}
								</Token.Provider>
							</AddressHighlightProvider>
						</TokenListMembershipProvider>
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
					</QueryClientProvider>
				</WagmiProvider>
				<Scripts />
			</body>
		</html>
	)
}

function useDevTools() {
	React.useEffect(() => {
		if (
			import.meta.env.MODE === 'development' &&
			import.meta.env.VITE_ENABLE_DEVTOOLS === 'true'
		) {
			let eruda: typeof import('eruda').default
			void import('eruda').then(({ default: _eruda }) => {
				eruda = _eruda
				eruda.init()
			})
			return () => eruda?.destroy()
		}
	}, [])
}

namespace styles {
	export const progress = style({
		left: '0',
		position: 'fixed',
		right: '0',
		top: '0',
		zIndex: 1,
	})
}

function resolveTokenLogo(options: Token.ResolveSrc.Options): string {
	return `/api/token/logo/${options.address}`
}
