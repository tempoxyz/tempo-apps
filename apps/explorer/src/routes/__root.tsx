import { TanStackDevtools } from '@tanstack/react-devtools'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useMatches,
	useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import * as React from 'react'
import { deserialize, type State, WagmiProvider } from 'wagmi'
import { ErrorBoundary } from '#comps/ErrorBoundary'
import { IntroSeenProvider } from '#comps/Intro'
import { OG_BASE_URL } from '#lib/og'
import { ProgressLine } from '#comps/ProgressLine'
import {
	captureEvent,
	normalizePathPattern,
	ProfileEvents,
} from '#lib/profiling'
import { getWagmiConfig, getWagmiStateSSR } from '#wagmi.config.ts'
import css from './styles.css?url'

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient
}>()({
	head: () => ({
		scripts: [
			{
				children: `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_aNlTw2xAUQKd9zTovXeYheEUpQpEhplehCK5r1e31HR',{api_host:'https://us.i.posthog.com', defaults:'2025-11-30'})`,
				type: 'text/javascript',
			},
		],
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: 'Explorer ⋅ Tempo',
			},
			{
				name: 'og:title',
				content: 'Explorer ⋅ Tempo',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1, maximum-scale=1',
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
		],
		links: [
			{
				rel: 'stylesheet',
				href: css,
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
				media: '(prefers-color-scheme: dark)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/favicon-32x32-dark.png',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon-16x16-light.png',
				media: '(prefers-color-scheme: dark)',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/favicon-16x16-dark.png',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'apple-touch-icon',
				sizes: '180x180',
				href: '/favicon-light.png',
				media: '(prefers-color-scheme: light)',
			},
			{
				rel: 'apple-touch-icon',
				sizes: '180x180',
				href: '/favicon-dark.png',
				media: '(prefers-color-scheme: dark)',
			},
		],
	}),
	errorComponent: (props) => (
		<RootDocument>
			<ErrorBoundary {...props} />
		</RootDocument>
	),
	loader: () => getWagmiStateSSR(),
	shellComponent: RootDocument,
})

function useTTFBTiming() {
	React.useEffect(() => {
		const navigation = performance.getEntriesByType('navigation')[0] as
			| PerformanceNavigationTiming
			| undefined
		if (!navigation) return

		captureEvent(ProfileEvents.TTFB, {
			ttfb_ms: Math.round(navigation.responseStart - navigation.requestStart),
			path: window.location.pathname,
			route_pattern: normalizePathPattern(window.location.pathname),
		})
	}, [])
}

type LoaderTiming = { duration_ms: number; route_id: string }

function useLoaderTiming() {
	const matches = useMatches()
	const reportedRef = React.useRef<Set<string>>(new Set())

	React.useEffect(() => {
		for (const match of matches) {
			const loaderData = match.loaderData as
				| { __loaderTiming?: LoaderTiming }
				| undefined
			const timing = loaderData?.__loaderTiming
			if (!timing) continue

			const key = `${timing.route_id}-${timing.duration_ms}`
			if (reportedRef.current.has(key)) continue
			reportedRef.current.add(key)

			captureEvent(ProfileEvents.LOADER_DURATION, {
				duration_ms: timing.duration_ms,
				route_id: timing.route_id,
				path: window.location.pathname,
				route_pattern: normalizePathPattern(window.location.pathname),
			})
		}
	}, [matches])
}

function useFirstDrawTiming() {
	const navigationStartRef = React.useRef<number | null>(null)
	const previousPathRef = React.useRef<string | null>(null)

	const routerState = useRouterState({
		select: (state) => ({
			status: state.status,
			pathname: state.location.pathname,
		}),
	})

	React.useEffect(() => {
		// Navigation started
		if (routerState.status === 'pending' && !navigationStartRef.current) {
			navigationStartRef.current = performance.now()
			previousPathRef.current = routerState.pathname
		}

		// Navigation completed
		if (routerState.status === 'idle' && navigationStartRef.current) {
			const duration = performance.now() - navigationStartRef.current
			const fromPath = previousPathRef.current
			const toPath = routerState.pathname

			// Double rAF ensures the browser has actually painted
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					captureEvent(ProfileEvents.PAGE_FIRST_DRAW, {
						duration_ms: Math.round(duration),
						from_path: fromPath,
						to_path: toPath,
						route_pattern: normalizePathPattern(toPath),
					})

					navigationStartRef.current = null
				})
			})
		}
	}, [routerState.status, routerState.pathname])
}

function RootDocument({ children }: { children: React.ReactNode }) {
	useDevTools()
	useTTFBTiming()
	useLoaderTiming()
	useFirstDrawTiming()

	const { queryClient } = Route.useRouteContext()
	const [config] = React.useState(() => getWagmiConfig())
	const wagmiState = Route.useLoaderData({ select: deserialize<State> })

	const isLoading = useRouterState({
		select: (state) => state.status === 'pending',
	})

	return (
		<html lang="en" className="scheme-light-dark scrollbar-gutter-stable">
			<head>
				<HeadContent />
			</head>
			<body className="antialiased">
				<ProgressLine
					loading={isLoading}
					start={800}
					className="fixed top-0 left-0 right-0 z-1"
				/>
				<WagmiProvider config={config} initialState={wagmiState}>
					<QueryClientProvider client={queryClient}>
						<IntroSeenProvider>{children}</IntroSeenProvider>
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

let theme: 'light' | 'dark' | undefined

function useDevTools() {
	React.useEffect(() => {
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
