/// <reference types="@cloudflare/workers-types" />

interface Env {
	/** Cloudflare KV namespace for game state */
	GAME_STATE: KVNamespace
	/** Cloudflare KV namespace for WebAuthn key storage */
	KEY_STORE: KVNamespace
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
	/** Number of emulator cycles per move */
	CYCLES_PER_MOVE?: string
}

declare module 'cloudflare:workers' {
	namespace Cloudflare {
		export interface Env extends globalThis.Env {}
	}
}
