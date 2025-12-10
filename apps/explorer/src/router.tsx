import * as Sentry from '@sentry/tanstackstart-react'
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { hashFn } from 'wagmi/query'
import { NotFound } from '#comps/NotFound'
import { Layout } from '#routes/_layout.tsx'
import { routeTree } from '#routeTree.gen.ts'

export const getRouter = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				queryKeyHashFn: hashFn,
				gcTime: 1_000 * 60 * 60 * 24, // 24 hours
			},
		},
	})

	const router = createRouter({
		routeTree,
		notFoundMode: 'fuzzy',
		scrollRestoration: true,
		context: { queryClient },
		defaultPreload: 'intent',
		defaultPreloadDelay: 150,
		defaultNotFoundComponent: () => (
			<Layout>
				<NotFound />
			</Layout>
		),
	})

	// @see https://tanstack.com/router/latest/docs/integrations/query
	setupRouterSsrQueryIntegration({
		router,
		queryClient,
		wrapQueryClient: false,
	})

	if (!router.isServer) {
		Sentry.init({
			dsn: 'https://170113585c24ca7a67704f86cccd6750@o4510262603481088.ingest.us.sentry.io/4510467689218048',
			enabled: import.meta.env.PROD,
			// This sets the sample rate to be 10%. You may want this to be 100% while
			// in development and sample at a lower rate in production
			replaysSessionSampleRate: 0.1,
			// If the entire session is not sampled, use the below sample rate to sample
			// sessions when an error occurs.
			replaysOnErrorSampleRate: 1.0,
			// 'tunnel'
			// Adds request headers and IP for users, for more info visit:
			// https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options/#sendDefaultPii
			sendDefaultPii: true,
			enableMetrics: true,
			integrations: [
				Sentry.dedupeIntegration(),
				Sentry.zodErrorsIntegration(),
				Sentry.captureConsoleIntegration(),
				Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
			],
		})
	}

	return router
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
