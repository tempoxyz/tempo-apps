/**
 * Base class for all Tempo Agentic Layer errors.
 * Provides structured information for better developer experience.
 */
export class TempoError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
		public readonly fix?: string,
		public readonly docsUrl?: string,
	) {
		super(message)
		this.name = this.constructor.name
		// Ensure stack trace is captured in Node.js
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor)
		}
	}

	/**
	 * Convert error to a plain object for JSON serialization
	 */
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			context: this.context,
			fix: this.fix,
			docsUrl: this.docsUrl,
		}
	}
}

/**
 * Errors related to payment gate configuration
 */
export class PaymentConfigError extends TempoError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(
			message,
			'PAYMENT_CONFIG_ERROR',
			context,
			'Review your `.env` file or configuration object. Ensure TEMPO_RECIPIENT, TEMPO_AMOUNT, and TEMPO_RPC_URL are correctly set.',
			'https://github.com/tempo/docs#configuration',
		)
	}
}

/**
 * Errors occurring during payment verification
 */
export class PaymentVerificationError extends TempoError {
	constructor(
		message: string,
		txHash: string,
		context?: Record<string, unknown>,
	) {
		super(
			message,
			'PAYMENT_VERIFICATION_ERROR',
			{ ...context, txHash },
			'Ensure the transaction has been mined, has sufficient confirmations (>1), and matches the required amount/token/recipient.',
			'https://github.com/tempo/docs#verification',
		)
	}
}

/**
 * Errors related to network connectivity or RPC failures
 */
export class NetworkError extends TempoError {
	constructor(message: string, context?: Record<string, unknown>) {
		super(
			message,
			'NETWORK_ERROR',
			context,
			'Check your RPC connection. If using a public RPC, you may be rate-limited. Try a dedicated RPC provider.',
			'https://github.com/tempo/docs#troubleshooting',
		)
	}
}

/**
 * Errors related to replay protection
 */
export class ReplayError extends TempoError {
	constructor(txHash: string, context?: Record<string, unknown>) {
		super(
			'Transaction hash has already been processed or is currently being verified.',
			'REPLAY_ERROR',
			{ ...context, txHash },
			'Generate a new transaction for this request. Do not reuse transaction hashes for unique payments.',
			'https://github.com/tempo/docs#replay-protection',
		)
	}
}
