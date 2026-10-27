import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { hashFn } from 'wagmi/query'
import { NotFound } from '#comps/NotFound'
import { initSentry } from '#lib/sentry'
import { shouldRetryQuery } from '#lib/query-retry'
import { routeTree } from '#routeTree.gen.ts'

export const getRouter = () => {
	// Fresh QueryClient per request for SSR isolation
	const queryClient: QueryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: shouldRetryQuery,
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
		}),
	})

	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		context: { queryClient },
		defaultPreload: 'viewport',
		defaultPreloadDelay: 150,
		// Routes render inside `_layout`; the root route wraps unmatched URLs.
		defaultNotFoundComponent: () => <NotFound />,
	})

	if (!router.isServer) {
		initSentry(router)
	}

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
