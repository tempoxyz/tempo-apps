import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { hashFn } from 'wagmi/query'
import { NotFound } from '#comps/NotFound'
import {
	captureEvent,
	normalizePathPattern,
	ProfileEvents,
} from '#lib/profiling'
import { routeTree } from '#routeTree.gen.ts'

const queryStartTimes = new WeakMap<object, number>()

export const getRouter = () => {
	// Fresh QueryClient per request for SSR isolation
	const queryClient: QueryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1_000, // needed for SSR - prevents refetch on hydration
				gcTime: 1_000 * 60 * 60 * 24, // 24 hours
				queryKeyHashFn: hashFn,
				refetchOnWindowFocus: false,
				refetchOnReconnect: () => !queryClient.isMutating(),
			},
		},
		mutationCache: new MutationCache({
			onError: (error) => {
				if (import.meta.env.MODE !== 'development') return
				console.error(error)
			},
		}),
		queryCache: new QueryCache({
			onError: (error, query) => {
				if (import.meta.env.MODE !== 'development') return
				if (query.state.data !== undefined) console.error('[tsq]', error)
			},
			onSuccess: (_data, query) => {
				if (typeof window === 'undefined') return

				const startTime = queryStartTimes.get(query)
				if (startTime) {
					const duration = performance.now() - startTime
					queryStartTimes.delete(query)

					const queryKey = query.queryKey
					const queryName = Array.isArray(queryKey)
						? String(queryKey[0])
						: 'unknown'

					captureEvent(ProfileEvents.API_LATENCY, {
						query_name: queryName,
						duration_ms: Math.round(duration),
						from_cache: query.state.dataUpdateCount > 1,
						status: 'success',
						path: window.location.pathname,
						route_pattern: normalizePathPattern(window.location.pathname),
					})
				}
			},
			onSettled: (_data, error, query) => {
				if (typeof window === 'undefined') return
				if (!error) return

				const startTime = queryStartTimes.get(query)
				if (startTime) {
					const duration = performance.now() - startTime
					queryStartTimes.delete(query)

					const queryKey = query.queryKey
					const queryName = Array.isArray(queryKey)
						? String(queryKey[0])
						: 'unknown'

					captureEvent(ProfileEvents.API_LATENCY, {
						query_name: queryName,
						duration_ms: Math.round(duration),
						from_cache: false,
						status: 'error',
						error_message:
							error instanceof Error ? error.message : String(error),
						path: window.location.pathname,
						route_pattern: normalizePathPattern(window.location.pathname),
					})
				}
			},
		}),
	})

	// Subscribe to query cache events to track fetch start times
	if (typeof window !== 'undefined') {
		queryClient.getQueryCache().subscribe((event) => {
			if (event.type === 'updated' && event.action.type === 'fetch') {
				queryStartTimes.set(event.query, performance.now())
			}
		})
	}

	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		context: { queryClient },
		defaultPreload: 'intent',
		defaultPreloadDelay: 150,
		defaultNotFoundComponent: () => <NotFound />,
	})

	// @see https://tanstack.com/router/latest/docs/integrations/query
	setupRouterSsrQueryIntegration({
		router,
		queryClient,
		wrapQueryClient: false,
	})

	return router
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
