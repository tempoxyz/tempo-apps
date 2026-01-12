interface EnvironmentVariables {
	readonly INDEXER_API_KEY: string | undefined

	readonly VITE_OG_URL: string
	readonly VITE_CONTRACT_VERIFY_URL: string

	readonly VITE_TEMPO_ENV: 'testnet' | 'moderato' | 'devnet' | 'presto'

	readonly TEMPO_RPC_KEY: string
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
