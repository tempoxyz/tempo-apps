declare module 'cloudflare:test' {
	interface ProvidedEnv extends Cloudflare.Env {
		TEST_CHAIN_ID: number
		TEST_CHAIN_NAME: string
		VITEST_ENV: 'devnet' | 'testnet' | 'mainnet'
	}
}
