import '../worker-configuration.d.ts'

declare module 'cloudflare:test' {
	interface ProvidedEnv extends Cloudflare.Env {}
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
