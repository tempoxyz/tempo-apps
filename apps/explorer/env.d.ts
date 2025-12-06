interface EnvironmentVariables {
	readonly INDEXER_API_KEY: string | undefined
	readonly VITE_LOG_LEVEL: 'info' | 'warn' | 'silent'
}

interface ImportMetaEnv extends Cloudflare.Env {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare namespace NodeJS {
	interface ProcessEnv extends EnvironmentVariables {}
}
