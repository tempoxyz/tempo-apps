interface EnvironmentVariables {
	readonly PORT: string

	readonly WHITELISTED_ORIGINS: string
	readonly VITE_LOG_LEVEL: 'info' | 'warn' | 'silent'

	readonly TEMPO_RPC_KEY: string

	readonly CLOUDFLARE_ACCOUNT_ID: string
	readonly CLOUDFLARE_DATABASE_ID: string
	readonly CLOUDFLARE_D1_TOKEN: string
	readonly CLOUDFLARE_D1_ENVIRONMENT: 'local' | (string & {})
}

// Node.js `process.env` auto-completion
declare namespace NodeJS {
	interface ProcessEnv extends EnvironmentVariables {
		readonly NODE_ENV: 'development' | 'production'
	}
}

// Bun/vite `import.meta.env` auto-completion
interface ImportMetaEnv extends EnvironmentVariables {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare const __BASE_URL__: string
declare const __BUILD_VERSION__: string
