interface Env {
	readonly PORT: string
	readonly ENVIRONMENT: 'development' | 'production'

	readonly LOGGING?: 'verbose' | 'normal' | 'silent' | undefined

	readonly APP_VERSION: string

	// Cloudflare R2
	readonly S3_ENDPOINT: string
	readonly S3_BUCKET_NAME: string
	readonly S3_ACCESS_KEY_ID: string
	readonly S3_SECRET_ACCESS_KEY: string
	readonly S3_PUBLIC_DEVELOPMENT_URL: string

	readonly ASSETS: Fetcher
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


declare const __BUILD_VERSION__: string
