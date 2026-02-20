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
import { AddressHighlightProvider } from '#comps/AddressHighlight'
import { BreadcrumbsProvider } from '#comps/Breadcrumbs'
import { ErrorBoundary } from '#comps/ErrorBoundary'
import { IntroSeenProvider } from '#comps/Intro'
import { ThemeProvider } from '#lib/theme'
import { OG_BASE_URL } from '#lib/og'
import { ProgressLine } from '#comps/ProgressLine'
import {
	type LoaderTiming,
	captureEvent,
	getNavigationId,
	nextNavigationId,
	normalizePathPattern,
	ProfileEvents,
} from '#lib/profiling'
import { getWagmiConfig, getWagmiStateSSR } from '#wagmi.config.ts'
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
	scripts: async () => {
		const scripts: Array<{ children: string; type: string }> = []

		// Patch fetch/Request to strip basic auth credentials from same-origin URLs.
		// Required for TanStack Start server functions (/_serverFn/...) which use
		// relative fetches that inherit credentials from the page URL.
		// Always active because browsers hide URL credentials from JS (Location has
		// no username/password, and Chrome strips them from location.href), making
		// detection impossible. The patch is a no-op when no credentials are present.
		scripts.push({
			children: `(function(){var o=window.location.protocol+"//"+window.location.host;var F=window.fetch;var R=window.Request;var s=function(i){var u=i instanceof Request?i.url:String(i);try{var a=new URL(u,o);if(a.origin===o){a.username="";a.password="";}return a.href}catch(e){return null}};window.fetch=function(i,n){try{var h=s(i);if(h){if(i instanceof Request)return F.call(this,new R(h,i),n);return F.call(this,h,n)}}catch(e){}return F.call(this,i,n)};var W=function(i,n){var h=s(i);if(h)return new R(h,n||i);return new R(i,n)};W.prototype=R.prototype;window.Request=W;})();`,
			type: 'text/javascript',
		})

		if (import.meta.env.PROD) {
			scripts.push({
				// PostHog analytics - deferred to avoid blocking initial render
				children: `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
(window.requestIdleCallback||function(cb){setTimeout(cb,50)})(function(){posthog.init('phc_aNlTw2xAUQKd9zTovXeYheEUpQpEhplehCK5r1e31HR',{api_host:'https://us.i.posthog.com',defaults:'2025-11-30',disable_session_recording:true})});`,
				type: 'text/javascript',
			})
		}

		return scripts
	},
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

function usePageLoadTiming() {
	React.useEffect(() => {
		function capture() {
			const navigation = performance.getEntriesByType('navigation')[0] as
				| PerformanceNavigationTiming
				| undefined
			if (!navigation) return

			captureEvent(ProfileEvents.PAGE_LOAD, {
				duration_ms: Math.round(navigation.domInteractive),
				load_event_ms: Math.round(navigation.loadEventEnd || 0),
				ttfb_ms: Math.round(navigation.responseStart - navigation.requestStart),
				path: window.location.pathname,
				route_pattern: normalizePathPattern(window.location.pathname),
				navigation_type: navigation.type,
			})
		}

		if (document.readyState === 'complete') {
			capture()
		} else {
			window.addEventListener('load', capture, { once: true })
			return () => window.removeEventListener('load', capture)
		}
	}, [])
}

function useErrorTracking() {
	React.useEffect(() => {
		const reported = new Set<string>()

		function dedupeKey(message: string, stack?: string): string {
			return `${message}::${stack?.slice(0, 200) ?? ''}`
		}

		function handleError(event: ErrorEvent) {
			const key = dedupeKey(event.message, event.error?.stack)
			if (reported.size > 50 || reported.has(key)) return
			reported.add(key)

			captureEvent(ProfileEvents.ERROR, {
				error_type: 'window_error',
				message: event.message,
				stack: event.error?.stack?.slice(0, 1000),
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
				path: window.location.pathname,
				route_pattern: normalizePathPattern(window.location.pathname),
				navigation_id: getNavigationId(),
			})
		}

		function handleRejection(event: PromiseRejectionEvent) {
			const message =
				event.reason instanceof Error
					? event.reason.message
					: String(event.reason)
			const stack =
				event.reason instanceof Error ? event.reason.stack : undefined
			const key = dedupeKey(message, stack)
			if (reported.size > 50 || reported.has(key)) return
			reported.add(key)

			captureEvent(ProfileEvents.ERROR, {
				error_type: 'unhandled_rejection',
				message,
				stack: stack?.slice(0, 1000),
				path: window.location.pathname,
				route_pattern: normalizePathPattern(window.location.pathname),
				navigation_id: getNavigationId(),
			})
		}

		window.addEventListener('error', handleError)
		window.addEventListener('unhandledrejection', handleRejection)
		return () => {
			window.removeEventListener('error', handleError)
			window.removeEventListener('unhandledrejection', handleRejection)
		}
	}, [])
}

function useAppBoot() {
	React.useEffect(() => {
		captureEvent(ProfileEvents.APP_BOOT, { status: 'success' })
	}, [])
}

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

			if (reportedRef.current.has(timing.timing_id)) continue
			reportedRef.current.add(timing.timing_id)

			captureEvent(ProfileEvents.LOADER_DURATION, {
				duration_ms: timing.duration_ms,
				route_id: timing.route_id,
				status: timing.status,
				error_message: timing.error_message,
				navigation_id: getNavigationId(),
				path: window.location.pathname,
				route_pattern: normalizePathPattern(window.location.pathname),
			})
		}
	}, [matches])
}

function useFirstDrawTiming() {
	const navigationStartRef = React.useRef<number | null>(null)
	const previousPathRef = React.useRef<string | null>(null)
	const navIdRef = React.useRef<number>(0)

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
			navIdRef.current = nextNavigationId()
		}

		// Navigation completed
		if (routerState.status === 'idle' && navigationStartRef.current) {
			const start = navigationStartRef.current
			const fromPath = previousPathRef.current
			const toPath = routerState.pathname
			const navId = navIdRef.current

			navigationStartRef.current = null

			// Double rAF ensures the browser has actually painted
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					const duration = performance.now() - start

					captureEvent(ProfileEvents.PAGE_FIRST_DRAW, {
						duration_ms: Math.round(duration),
						from_path: fromPath,
						to_path: toPath,
						navigation_id: navId,
						route_pattern: normalizePathPattern(toPath),
					})
				})
			})
		}
	}, [routerState.status, routerState.pathname])
}

function RootDocument({ children }: { children: React.ReactNode }) {
	useDevTools()
	useTTFBTiming()
	usePageLoadTiming()
	useLoaderTiming()
	useFirstDrawTiming()
	useErrorTracking()
	useAppBoot()

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
						<BreadcrumbsProvider>
							<AddressHighlightProvider>
								<IntroSeenProvider>
									<ThemeProvider>{children}</ThemeProvider>
								</IntroSeenProvider>
							</AddressHighlightProvider>
						</BreadcrumbsProvider>
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
