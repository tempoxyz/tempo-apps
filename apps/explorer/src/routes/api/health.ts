import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
			GET: async () => new Response('OK', { status: 200 }),
		},
	},
})
