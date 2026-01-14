declare module 'cloudflare:workers' {
	interface Env {
		KEYS_KV: KVNamespace
		ALLOWED_ORIGINS: string
		RP_ID: string
	}
	export const env: Env
}
