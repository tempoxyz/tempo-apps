import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { hashFn } from 'wagmi/query'

import { routeTree } from '#routeTree.gen.ts'

export const getRouter = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60 * 1_000, // needed for SSR
				refetchOnWindowFocus: false,
				queryKeyHashFn: hashFn,
				gcTime: 1_000 * 60 * 60 * 24, // 24 hours
			},
		},
	})

	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		context: { queryClient },
		defaultPreloadStaleTime: 0,
		defaultNotFoundComponent: () => (
			<section className="flex flex-1 size-full items-center justify-center flex-col gap-4">
				<h1 className="text-8xl lg:text-9xl font-black italic text-primary">
					404
				</h1>
				<p className="text-secondary text-lg font-mono leading-3 tracking-wider">
					Page not found
				</p>
			</section>
		),
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
