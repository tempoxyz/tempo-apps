import { env } from 'cloudflare:workers'
import { Handler, Kv } from 'tempo.ts/server'

export default Handler.keyManager({
	kv: Kv.cloudflare(env.CREDENTIAL_STORE),
})
