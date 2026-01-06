import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
			GET: async () =>
				Response.json({
					status: 'ok',
					version: __BUILD_VERSION__,
					env: process.env.NODE_ENV,
				}),
		},
	},
})
