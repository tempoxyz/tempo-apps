import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { Handler, Kv } from 'tempo.ts/server'

export const Route = createFileRoute('/api/webauthn/$')({
	server: {
		handlers: {
			GET: ({ request }) =>
				Handler.keyManager({
					path: '/api/webauthn',
					kv: Kv.cloudflare(env.EXPLORER_PASSKEY_STORE),
				}).fetch(request),
		},
	},
})
