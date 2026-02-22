interface EnvironmentVariables {
	readonly OKTA_ISSUER: string
	readonly OKTA_CLIENT_ID: string
	readonly FAUCET_PRIVATE_KEY: string
	readonly TEMPO_RPC_URL: string
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
