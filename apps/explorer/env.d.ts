interface EnvironmentVariables {
	readonly DATADOG_APPLICATION_ID: string | undefined
	readonly DATADOG_CLIENT_TOKEN: string | undefined
	readonly DATADOG_SITE: string | undefined
	readonly SENTRY_AUTH_TOKEN: string | undefined
	readonly SENTRY_ORG: string | undefined
	readonly SENTRY_PROJECT: string | undefined
	readonly SENTRY_DSN: string | undefined
	readonly SENTRY_TRACES_SAMPLE_RATE: string | undefined
	readonly VITE_SENTRY_DSN: string | undefined
	readonly VITE_SENTRY_TRACES_SAMPLE_RATE: string | undefined

	readonly VITE_CONTRACT_VERIFICATION_API_BASE_URL: string
	readonly VITE_DATADOG_ALLOWED_TRACING_URLS: string | undefined
	readonly VITE_DATADOG_ENABLED: string | undefined
	readonly VITE_DATADOG_ENV: string | undefined
	readonly VITE_DATADOG_SERVICE: string | undefined
	readonly VITE_DATADOG_SESSION_REPLAY_SAMPLE_RATE: string | undefined
	readonly VITE_DATADOG_SESSION_SAMPLE_RATE: string | undefined
	readonly VITE_DATADOG_TRACE_SAMPLE_RATE: string | undefined
	/** Set at build time: "true" when a devnet build has DEVNET_RPC_URL. */
	readonly VITE_DEVNET_RPC_OVERRIDDEN: string | undefined
	/** Set at build time for a devnet build, empty otherwise (see vite.config.ts). */
	readonly DEVNET_API_URL: string | undefined
	readonly DEVNET_RPC_URL: string | undefined
	readonly DEVNET_TIDX_URL: string | undefined

	readonly VITE_TEMPO_ENV:
		| 'testnet'
		| 'devnet'
		| 'nextfork'
		| 'mainnet'
		| 'zone-prover'
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
