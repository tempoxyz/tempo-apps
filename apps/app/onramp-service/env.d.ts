interface EnvironmentVariables {
	readonly ENVIRONMENT: 'local' | 'moderato' | 'mainnet'
	readonly APP_DOMAIN: string
	readonly ALLOWED_ORIGINS: string
	readonly CB_API_KEY_ID: string
	readonly CB_API_KEY_SECRET: string
	readonly STRIPE_SECRET_KEY: string
	readonly STRIPE_WEBHOOK_SECRET: string
	readonly STRIPE_PUBLISHABLE_KEY: string
	readonly TESTNET_SENDER_PRIVATE_KEY: string
	readonly TESTNET_TOKEN_ADDRESS: string
	readonly PRESTO_RPC_AUTH: string | undefined
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
