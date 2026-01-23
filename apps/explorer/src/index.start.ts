import { createStart } from '@tanstack/react-start'
import { stripCredentialsMiddleware } from '#lib/middleware/strip-credentials'

export const startInstance = createStart(() => ({
	defaultSsr: true,
	functionMiddleware: [stripCredentialsMiddleware],
}))
