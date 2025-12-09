interface EnvironmentVariables {
	readonly INDEXER_API_KEY: string | undefined
	readonly VITE_LOG_LEVEL: 'info' | 'warn' | 'silent'
	readonly VITE_CONTRACT_VERIFICATION_URL: string
}

interface ImportMetaEnv extends Cloudflare.Env {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare namespace NodeJS {
	interface ProcessEnv extends EnvironmentVariables {}
}

declare module 'shiki/onig.wasm' {
	const wasm: unknown
	export default wasm
}
