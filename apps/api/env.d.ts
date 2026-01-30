interface Env {
	readonly PORT: string
	readonly NODE_ENV: 'development' | 'production'

	readonly APP_VERSION: string
}

// Node.js `process.env` auto-completion
declare namespace NodeJS {
	interface ProcessEnv extends Env {
		readonly NODE_ENV: 'development' | 'production'
	}
}

// Bun/vite `import.meta.env` auto-completion
interface ImportMetaEnv extends Env {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare const __BUILD_VERSION__: string
