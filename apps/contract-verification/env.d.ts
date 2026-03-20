interface EnvironmentVariables {
	readonly PORT: string
	readonly NODE_ENV: 'development' | 'production' | 'test'

	readonly WHITELISTED_ORIGINS: string
	readonly VITE_LOG_LEVEL:
		| 'debug'
		| 'error'
		| 'fatal'
		| 'info'
		| 'trace'
		| 'warning'

	readonly VITEST_ENV: 'devnet' | 'testnet' | 'mainnet'

	readonly VITE_BASE_URL: string

	readonly CLOUDFLARE_ACCOUNT_ID: string
	readonly CLOUDFLARE_DATABASE_ID: string
	readonly CLOUDFLARE_D1_TOKEN: string
	readonly CLOUDFLARE_D1_ENVIRONMENT: 'local' | (string & {})
}

// Node.js `process.env` auto-completion
declare namespace NodeJS {
	interface ProcessEnv extends EnvironmentVariables {}
}

// Bun/vite `import.meta.env` auto-completion
interface ImportMetaEnv extends EnvironmentVariables {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare const __BASE_URL__: string
declare const __BUILD_VERSION__: string
