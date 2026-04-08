type EnvironmentVariables = {}

interface ImportMetaEnv extends EnvironmentVariables {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare namespace NodeJS {
	interface ProcessEnv extends EnvironmentVariables {
		readonly NODE_ENV: 'development' | 'production' | 'test'
	}
}

declare namespace Cloudflare {
	interface Env {
		CLICKHOUSE_HOST: string
		CLICKHOUSE_USER: string
		CLICKHOUSE_PASSWORD: string
	}
}
