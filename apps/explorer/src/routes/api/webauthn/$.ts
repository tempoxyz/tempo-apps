import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { Handler, Kv } from 'tempo.ts/server'

export const Route = createFileRoute('/api/webauthn/$')({
	server: {
		handlers: {
			GET: ({ request }) => {
				const url = new URL(request.url)
				const path = url.pathname

				console.info('webauthn request', path)
				return Handler.keyManager({
					path: '/api/webauthn',
					kv: Kv.cloudflare(env.EXPLORER_PASSKEY_STORE),
				}).fetch(request)
			},
		},
	},
})
