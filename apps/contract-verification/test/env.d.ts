declare module 'cloudflare:test' {
	interface ProvidedEnv extends Cloudflare.Env {
		TEST_MIGRATIONS: Array<D1Migration>
	}
}

declare namespace Cloudflare {
	interface Env {
		TEST_MIGRATIONS: Array<D1Migration>
	}
}
