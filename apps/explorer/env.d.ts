interface EnvironmentVariables {
	readonly BASIC_AUTH: string | undefined
	readonly INDEXER_API_KEY: string | undefined
	readonly VITE_LOG_LEVEL: 'info' | 'warn' | 'silent'

	readonly VITE_OG_URL: string
	readonly VITE_CONTRACT_VERIFY_URL: string

	readonly VITE_TEMPO_RPC_WS: string
	readonly VITE_TEMPO_RPC_HTTP: string
	readonly VITE_TEMPO_CHAIN_ID: number
	readonly VITE_TEMPO_ENV: 'testnet' | 'moderato' | 'devnet'

	readonly TEMPO_RPC_KEY_DEVNET: string
	readonly TEMPO_RPC_KEY_TESTNET: string
	readonly TEMPO_RPC_KEY_MODERATO: string
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

declare const __BASE_URL__: string
declare const __BUILD_VERSION__: string

declare module 'shiki/onig.wasm' {
	const wasm: unknown
	export default wasm
}
