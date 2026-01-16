import {
	base64urlDecode,
	base64urlEncode,
	type ChargeRequest,
	formatReceipt,
	formatWwwAuthenticate,
	generateChallengeId,
	type PaymentChallenge,
	type PaymentCredential,
	type PaymentReceipt,
	parseAuthorization,
} from 'paymentauth-protocol'
import type { MiddlewareHandler } from 'hono'
import type { Address } from 'viem'
import type {
	X402PaymentPayload,
	X402PaymentReceipt,
	X402PaymentRequirements,
} from './types.js'

/**
 * Configuration for the x402 translation middleware
 */
export interface X402TranslationConfig {
	/** Network identifier for x402 (e.g., "base-sepolia", "tempo-moderato") */
	network: string
	/** Default chain ID for the network */
	chainId: number
}

/**
 * Middleware that translates between our IETF Payment Auth protocol and x402.
 *
 * This middleware:
 * 1. Translates incoming Authorization: Payment headers to X-PAYMENT headers
 * 2. Translates 402 responses with X-PAYMENT-REQUIREMENTS to WWW-Authenticate headers
 * 3. Translates X-PAYMENT-RESPONSE headers to Payment-Receipt headers
 *
 * This allows clients speaking our protocol to communicate with x402 servers.
 */
export function x402TranslationMiddleware(
	config: X402TranslationConfig,
): MiddlewareHandler {
	return async (c, next) => {
		const authHeader = c.req.header('Authorization')

		// Track the challenge ID so we can include it in the receipt
		let _challengeId: string | undefined

		// If we have an Authorization: Payment header, translate to X-PAYMENT
		if (authHeader?.startsWith('Payment ')) {
			try {
				const credential = parseAuthorization(authHeader)
				_challengeId = credential.id

				// Convert our credential to x402 payment payload
				const x402Payload = credentialToX402Payload(credential, config)

				// Set the X-PAYMENT header that x402 expects
				const x402Header = base64urlEncode(JSON.stringify(x402Payload))
				c.req.raw.headers.set('X-PAYMENT', x402Header)

				// Remove our Authorization header so x402 middleware doesn't see it
				c.req.raw.headers.delete('Authorization')
			} catch (e) {
				// If parsing fails, let it pass through - the server will handle the error
				console.error('Failed to parse Payment authorization:', e)
			}
		}

		await next()

		// Handle 402 responses - translate x402 format to our WWW-Authenticate format
		if (c.res.status === 402) {
			const x402Requirements = c.res.headers.get('X-PAYMENT-REQUIREMENTS')

			if (x402Requirements) {
				try {
					const requirements = JSON.parse(
						base64urlDecode(x402Requirements),
					) as X402PaymentRequirements

					// Convert x402 requirements to our challenge format
					const challenge = x402RequirementsToChallenge(requirements, config)

					// Create new response with our WWW-Authenticate header
					const newHeaders = new Headers(c.res.headers)
					newHeaders.set('WWW-Authenticate', formatWwwAuthenticate(challenge))
					newHeaders.delete('X-PAYMENT-REQUIREMENTS')
					newHeaders.set('Cache-Control', 'no-store')

					// Clone the response body
					const body = await c.res.text()
					c.res = new Response(body, {
						status: 402,
						headers: newHeaders,
					})
				} catch (e) {
					console.error('Failed to translate x402 requirements:', e)
				}
			}
		}

		// Handle successful responses - translate X-PAYMENT-RESPONSE to Payment-Receipt
		if (c.res.status === 200) {
			const x402Response = c.res.headers.get('X-PAYMENT-RESPONSE')

			if (x402Response) {
				try {
					const x402Receipt = JSON.parse(
						base64urlDecode(x402Response),
					) as X402PaymentReceipt

					// Convert x402 receipt to our format
					const receipt = x402ReceiptToReceipt(x402Receipt, config)

					// Create new response with our Payment-Receipt header
					const newHeaders = new Headers(c.res.headers)
					newHeaders.set('Payment-Receipt', formatReceipt(receipt))
					newHeaders.delete('X-PAYMENT-RESPONSE')

					// Clone the response body
					const body = await c.res.text()
					c.res = new Response(body, {
						status: 200,
						headers: newHeaders,
					})
				} catch (e) {
					console.error('Failed to translate x402 receipt:', e)
				}
			}
		}
	}
}

/**
 * Convert our PaymentCredential to x402 payment payload format
 */
function credentialToX402Payload(
	credential: PaymentCredential,
	config: X402TranslationConfig,
): X402PaymentPayload {
	return {
		x402Version: 1,
		scheme: 'exact',
		network: config.network,
		payload: {
			signature: credential.payload.signature,
		},
	}
}

/**
 * Convert x402 payment requirements to our challenge format
 */
function x402RequirementsToChallenge(
	requirements: X402PaymentRequirements,
	config: X402TranslationConfig,
): PaymentChallenge<ChargeRequest> {
	// Generate an expiry time (5 minutes from now)
	const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

	// Map x402 asset name to address (for Tempo, use the fee token address)
	// This mapping would need to be extended for different networks
	const assetAddress = getAssetAddress(requirements.asset, config.network)

	const request: ChargeRequest = {
		amount: requirements.maxAmountRequired,
		asset: assetAddress,
		destination: requirements.payTo,
		expires: expiresAt.toISOString(),
	}

	return {
		id: generateChallengeId(),
		realm: 'x402',
		method: 'tempo',
		intent: 'charge',
		request,
		expires: expiresAt.toISOString(),
		description: requirements.extra?.description ?? requirements.extra?.name,
	}
}

/**
 * Convert x402 receipt to our receipt format
 */
function x402ReceiptToReceipt(
	x402Receipt: X402PaymentReceipt,
	_config: X402TranslationConfig,
): PaymentReceipt {
	return {
		status: x402Receipt.success ? 'success' : 'failed',
		method: 'tempo',
		timestamp: new Date().toISOString(),
		reference: x402Receipt.transactionHash ?? '0x',
	}
}

/**
 * Map asset name to address for a given network
 */
function getAssetAddress(asset: string | undefined, network: string): Address {
	// For tempo networks, always use AlphaUSD
	if (network.startsWith('tempo')) {
		return '0x20c0000000000000000000000000000000000001'
	}

	// Default asset addresses for different networks
	const assetMap: Record<string, Record<string, Address>> = {
		'base-sepolia': {
			USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
		},
		base: {
			USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		},
	}

	const networkAssets = assetMap[network] ?? {}
	return (
		networkAssets[asset ?? 'USDC'] ??
		'0x20c0000000000000000000000000000000000001'
	)
}
