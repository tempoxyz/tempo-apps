import type { Address, Hex } from 'viem'

/**
 * Payment method identifier.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-6
 */
export type PaymentMethod = 'tempo' | 'x402' | (string & {})

/**
 * Payment intent type.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-7
 */
export type PaymentIntent =
	| 'charge'
	| 'authorize'
	| 'subscription'
	| (string & {})

/**
 * Payment challenge sent in WWW-Authenticate header.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-5.1
 */
export interface PaymentChallenge<TRequest = unknown> {
	/** Unique identifier for this payment challenge (128+ bits entropy) */
	id: string
	/** Protection space identifier */
	realm: string
	/** Payment method identifier */
	method: PaymentMethod
	/** Payment intent type */
	intent: PaymentIntent
	/** Base64url-encoded JSON payment request (decoded here) */
	request: TRequest
	/** Optional expiry timestamp (ISO 8601) */
	expires?: string
	/** Optional human-readable description */
	description?: string
}

/**
 * Charge request for tempo method with intent="charge".
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-payment-method-00#section-6.1
 */
export interface ChargeRequest {
	/** Amount in base units (stringified number, e.g., "10000" = 0.01 with 6 decimals) */
	amount: string
	/** TIP-20 token address */
	asset: Address
	/** Recipient address */
	destination: Address
	/** Expiry timestamp (ISO 8601) */
	expires: string
	/** If true, server will pay transaction fees */
	feePayer?: boolean
}

/**
 * Authorize request for tempo method with intent="authorize".
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-payment-method-00#section-6.2
 */
export interface AuthorizeRequest {
	/** TIP-20 token address */
	asset: Address
	/** Authorized spender address (required for transaction fulfillment) */
	destination?: Address
	/** Expiry timestamp (ISO 8601) */
	expires: string
	/** Maximum spend amount in base units */
	limit: string
	/** Optional start timestamp (ISO 8601) */
	validFrom?: string
	/** If true, server will pay transaction fees */
	feePayer?: boolean
}

/**
 * Subscription request for tempo method with intent="subscription".
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-payment-method-00#section-6.3
 */
export interface SubscriptionRequest {
	/** Amount per period in base units */
	amount: string
	/** TIP-20 token address */
	asset: Address
	/** Total expiry timestamp (ISO 8601) */
	expires: string
	/** Period duration in seconds (stringified number) */
	period: string
	/** Optional start timestamp (ISO 8601) */
	validFrom?: string
}

/**
 * Payload type in payment credential.
 */
export type PayloadType = 'transaction' | 'keyAuthorization'

/**
 * Payment credential payload.
 * @see https://datatracker.ietf.org/doc/html/draft-tempo-payment-method-00#section-7.2
 */
export interface PaymentPayload {
	/** Fulfillment type */
	type: PayloadType
	/** Hex-encoded RLP-serialized signed data */
	signature: Hex
}

/**
 * Payment credential sent in Authorization header.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-5.2
 */
export interface PaymentCredential {
	/** Challenge ID from the server's WWW-Authenticate header */
	id: string
	/** Optional payer identifier as a DID */
	source?: string
	/** Tempo-specific payload */
	payload: PaymentPayload
}

/**
 * Payment receipt returned in Payment-Receipt header.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-5.3
 */
export interface PaymentReceipt {
	/** Payment status */
	status: 'success' | 'failed'
	/** Payment method used */
	method: PaymentMethod
	/** ISO 8601 settlement time */
	timestamp: string
	/** Method-specific reference (e.g., transaction hash) */
	reference: string
}

/**
 * Error response body for 402 responses.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpauth-payment-01#section-8
 */
export interface PaymentError {
	error:
		| 'payment_required'
		| 'payment_insufficient'
		| 'payment_expired'
		| 'payment_verification_failed'
		| 'payment_method_unsupported'
		| 'malformed_proof'
	message: string
}
