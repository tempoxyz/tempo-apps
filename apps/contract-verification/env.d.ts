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

	/** URL to fetch dynamic chain configs from (optional). */
	readonly CHAINS_CONFIG_URL?: string
	/** Bearer token for authenticating with the chain config endpoint (optional). */
	readonly CHAINS_CONFIG_AUTH_TOKEN?: string
}

// Augment the wrangler-generated `Cloudflare.Env` with the optional
// Secrets Store binding for the chain registry auth token. The binding is
// not always present (e.g. local dev or in environments where it has not
// been provisioned) so it is typed as optional and we still want to
// runtime-check for it in code.
declare namespace Cloudflare {
	interface Env {
		readonly CHAINS_CONFIG_AUTH_TOKEN?: string
		readonly CHAINS_CONFIG_AUTH_TOKEN_SECRET?: SecretsStoreSecret
	}
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
