import { env } from 'cloudflare:workers'
import { Handler, Kv } from 'accounts/server'

const allowedOrigins = env.ALLOWED_ORIGINS.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean)

export default Handler.webAuthn({
	kv: Kv.cloudflare(env.KEY_STORE),
	origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
	rpId: env.RP_ID,
})
