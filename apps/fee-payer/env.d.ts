interface EnvironmentVariables {
	readonly TEMPO_ENV: 'testnet' | 'devnet' | 'moderato' | 'localnet' | 'mainnet'
	readonly TEMPO_API_KEY?: string
	readonly TEMPO_LEGACY_KEYS?: string
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

declare const __BUILD_VERSION__: string
