import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from '#routeTree.gen.ts'

export const getRouter = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1_000,
				gcTime: 1_000 * 60 * 60 * 24,
				refetchOnWindowFocus: false,
			},
		},
	})

	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		context: { queryClient },
		defaultPreload: 'intent',
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
