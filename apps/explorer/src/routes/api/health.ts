import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
			GET: async () =>
				json({
					status: 'healthy',
					timestamp: new Date().toISOString(),
					uptime: process.uptime(),
					memory: process.memoryUsage(),
					version: process.env.npm_package_version,
				}),
		},
	},
})
