interface EnvironmentVariables {
	readonly ENVIRONMENT: 'local' | 'moderato' | 'mainnet'
	readonly APP_DOMAIN: string
	readonly ALLOWED_ORIGINS: string
	readonly CB_API_KEY_ID: string
	readonly CB_API_KEY_SECRET: string
}

interface ImportMetaEnv extends EnvironmentVariables {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare namespace NodeJS {
	interface ProcessEnv extends EnvironmentVariables {
		readonly NODE_ENV: 'development' | 'production' | 'test'
	}
}
