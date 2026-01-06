import { createFileRoute } from '@tanstack/react-router'
import { proxy } from 'hono/proxy'

export const Route = createFileRoute('/api/ph/$')({
	server: {
		handlers: {
			ANY: async ({ request, params }) =>
				proxy(`https://us.i.posthog.com/${params._splat}`, request),
		},
	},
})
