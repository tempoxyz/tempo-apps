/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:workers' {
	interface Env {
		/** Destination wallet address for payments */
		DESTINATION_ADDRESS: string
		/** Tempo RPC URL */
		TEMPO_RPC_URL: string
		/** Optional: RPC username for authenticated endpoints */
		TEMPO_RPC_USERNAME?: string
		/** Optional: RPC password for authenticated endpoints */
		TEMPO_RPC_PASSWORD?: string
		/** Private key for the fee payer wallet (0x-prefixed) */
		FEE_PAYER_PRIVATE_KEY: string
		/** Fee token address (default: AlphaUSD) */
		FEE_TOKEN_ADDRESS?: string
		/** Payment amount in base units (default: 10000 = 0.01 with 6 decimals) */
		PAYMENT_AMOUNT?: string
		/** Challenge validity in seconds (default: 300 = 5 minutes) */
		CHALLENGE_VALIDITY_SECONDS?: string
		/** Network identifier for x402 */
		X402_NETWORK?: string
	}
	const env: Env
	export { env, Env }
}
