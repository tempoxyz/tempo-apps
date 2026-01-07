import '../worker-configuration.d.ts'

declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {}
}
