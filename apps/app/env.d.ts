interface EnvironmentVariables {
	readonly MODE: 'development' | 'production'
	readonly VITE_TEMPO_ENV: 'moderato' | 'devnet' | 'presto'
	readonly VITE_ENABLE_DEVTOOLS: string | undefined
}

interface ImportMetaEnv extends EnvironmentVariables {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare namespace NodeJS {
	interface ProcessEnv extends EnvironmentVariables {
		readonly NODE_ENV: 'development' | 'production' | 'test'
		readonly TEMPO_RPC_KEY: string | undefined
		readonly PRESTO_RPC_AUTH: string | undefined
		readonly INDEXER_API_KEY: string | undefined
	}
}

declare const __BASE_URL__: string
declare const __BUILD_VERSION__: string
