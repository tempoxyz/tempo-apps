interface EnvironmentVariables {
	readonly TEMPO_ENV: 'testnet' | 'devnet' | 'moderato' | 'localnet' | 'mainnet'
	readonly TEMPO_RPC_URL?: string
	readonly ALLOWED_ORIGINS: string
	readonly SPONSOR_PRIVATE_KEY?: string
	readonly SPONSOR_NAME?: string
	readonly SPONSOR_URL?: string
}
