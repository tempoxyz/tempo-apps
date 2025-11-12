interface EnvironmentVariables {
	readonly INDEXSUPPLY_API_KEY: string
}

interface ImportMetaEnv extends Cloudflare.Env {}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare namespace NodeJS {
	interface ProcessEnv extends EnvironmentVariables {}
}
