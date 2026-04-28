import { env } from 'cloudflare:workers'
import { Handler, Kv } from 'accounts/server'

const origins = env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())

export default Handler.webAuthn({
	kv: Kv.cloudflare(env.KEY_STORE),
	origin: origins.length === 1 ? origins[0] : origins,
	rpId: env.RP_ID,
})
