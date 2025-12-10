interface Env {
	readonly PORT: string

	readonly CLOUDFLARE_ACCOUNT_ID: string
	readonly CLOUDFLARE_DATABASE_ID: string
	readonly CLOUDFLARE_D1_TOKEN: string
	readonly CLOUDFLARE_D1_ENVIRONMENT: 'local' | (string & {})
}

// Node.js `process.env` auto-completion
declare namespace NodeJS {
	interface ProcessEnv extends Env {
		readonly NODE_ENV: 'development' | 'production'
	}
}

// Bun/vite `import.meta.env` auto-completion
interface ImportMetaEnv extends Env {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
