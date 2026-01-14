import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from '#routeTree.gen.ts'
import '#lib/i18n'

export const getRouter = () => {
	const queryClient: QueryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1_000,
				gcTime: 1_000 * 60 * 60 * 24,
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
		defaultPreload: 'intent',
		defaultPreloadDelay: 150,
	})

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
