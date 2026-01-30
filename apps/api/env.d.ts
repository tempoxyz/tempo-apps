interface Env {
	readonly PORT: string
	readonly NODE_ENV: 'development' | 'production'
}

declare namespace NodeJS {
	interface ProcessEnv extends Env {
		readonly NODE_ENV: 'development' | 'production'
	}
}

interface ImportMetaEnv extends Env {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare const __BASE_URL__: string
declare const __BUILD_VERSION__: string
