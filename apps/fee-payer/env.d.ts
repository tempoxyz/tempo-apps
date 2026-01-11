interface EnvironmentVariables {
	readonly TEMPO_ENV: 'testnet' | 'devnet' | 'moderato'
	readonly TEMPO_RPC_URL: string
	readonly ALLOWED_ORIGINS: string
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
