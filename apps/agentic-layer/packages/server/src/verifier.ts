import { verifyPaymentHash } from '@tempo/402-common'
import type { VerifyConfig } from '@tempo/402-common'

/**
 * PaymentVerifier provides a class-based interface for on-chain settlement checks.
 * Useful for architectures where a persistent verifier instance is preferred.
 */
export class PaymentVerifier {
	private config: VerifyConfig

	/**
	 * Creates a new PaymentVerifier instance.
	 * @param config - Base verification configuration
	 */
	constructor(config: VerifyConfig) {
		this.config = config
	}

	/**
	 * Verifies a payment transaction hash.
	 *
	 * @param txHash - The transaction hash to verify
	 * @param options - Optional overrides for this specific check
	 * @returns Promise resolving to true if valid, false otherwise
	 */
	public async verifyPayment(
		txHash: `0x${string}`,
		options?: Partial<VerifyConfig>,
	): Promise<boolean> {
		return verifyPaymentHash(txHash, {
			...this.config,
			...options,
		})
	}
}
