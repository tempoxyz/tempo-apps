/// <reference types="@cloudflare/workers-types" />

declare module 'cloudflare:workers' {
	interface Env {
		/** Destination wallet address for payments */
		DESTINATION_ADDRESS: string
		/** Base Sepolia RPC URL */
		BASE_RPC_URL: string
		/** Optional: RPC username for authenticated endpoints */
		BASE_RPC_USERNAME?: string
		/** Optional: RPC password for authenticated endpoints */
		BASE_RPC_PASSWORD?: string
		/** Fee token address (default: USDC on Base Sepolia) */
		FEE_TOKEN_ADDRESS?: string
		/** Payment amount in base units (default: 10000 = 0.01 with 6 decimals) */
		PAYMENT_AMOUNT?: string
		/** Challenge validity in seconds (default: 300 = 5 minutes) */
		CHALLENGE_VALIDITY_SECONDS?: string
	}
	const env: Env
	export { env, Env }
}
