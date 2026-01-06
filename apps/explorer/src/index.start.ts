import { createStart } from '@tanstack/react-start'
import { posthogMiddleware } from '#lib/posthog-middleware.ts'

export const startInstance = createStart(() => ({
	defaultSsr: true, // default is true
	requestMiddleware: [posthogMiddleware],
}))
