import { createFileRoute } from '@tanstack/react-router'
import { proxy } from 'hono/proxy'
import * as z from 'zod/mini'

const requestSchema = z.object({
	dest: z.url(),
})

export const Route = createFileRoute('/api/x/$')({
	onCatch: (error) => {
		console.error(error)
		return Response.json({ error: error.message }, { status: 500 })
	},
	server: {
		handlers: {
			ANY: async ({ request, params }) => {
				const url = new URL(request.url)
				const { data, error, success } = await requestSchema.safeParseAsync({
					dest: url.searchParams.get('dest'),
				})
				if (!success) return Response.json({ error: z.prettifyError(error) })

				const destUrl = new URL(data.dest)
				if (params._splat) destUrl.pathname = params._splat

				return proxy(destUrl.toString(), request)
			},
		},
	},
})
