export type StripePaymentIntentObject = {
	id: string
	amount: number
	currency: string
	status: string
	metadata: Record<string, string>
}

export type StripeChargeObject = {
	id: string
	amount: number
	currency: string
	status: string
	paid: boolean
	metadata: Record<string, string>
}

export type StripeEvent = {
	id: string
	type: string
	data: {
		object: StripePaymentIntentObject | StripeChargeObject
	}
}

export type ChargeMetadata = {
	destinationAddress: string
	environment: string
}

export async function verifyStripeSignature(
	payload: string,
	signature: string,
	secret: string,
): Promise<boolean> {
	const parts = signature.split(',')
	const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2)
	const v1Signature = parts.find((p) => p.startsWith('v1='))?.slice(3)

	if (!timestamp || !v1Signature) {
		console.error('[Stripe Webhook] Missing timestamp or signature')
		return false
	}

	const timestampNum = Number.parseInt(timestamp, 10)
	const now = Math.floor(Date.now() / 1000)
	const tolerance = 300

	if (Math.abs(now - timestampNum) > tolerance) {
		console.error('[Stripe Webhook] Timestamp outside tolerance')
		return false
	}

	const signedPayload = `${timestamp}.${payload}`
	const encoder = new TextEncoder()

	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)

	const signatureBytes = await crypto.subtle.sign(
		'HMAC',
		key,
		encoder.encode(signedPayload),
	)

	const expectedSignature = Array.from(new Uint8Array(signatureBytes))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')

	return expectedSignature === v1Signature
}

export function parseStripeEvent(payload: string): StripeEvent {
	return JSON.parse(payload) as StripeEvent
}

export type PaymentIntentMetadata = {
	destinationAddress: string
	amount: string
	environment: string
}

export function extractPaymentMetadata(
	event: StripeEvent,
): PaymentIntentMetadata | null {
	if (event.type !== 'payment_intent.succeeded') {
		return null
	}

	const metadata = event.data.object.metadata as PaymentIntentMetadata
	if (!metadata.destinationAddress || !metadata.amount) {
		console.error('[Stripe Webhook] Missing required metadata')
		return null
	}

	return metadata
}

export function extractChargeMetadata(
	event: StripeEvent,
): ChargeMetadata | null {
	if (event.type !== 'charge.succeeded') {
		return null
	}

	const metadata = event.data.object.metadata as ChargeMetadata
	if (!metadata.destinationAddress) {
		console.error(
			'[Stripe Webhook] Missing destinationAddress in charge metadata',
		)
		return null
	}

	return metadata
}

export function getChargeAmountInDollars(event: StripeEvent): number | null {
	if (event.type !== 'charge.succeeded') {
		return null
	}

	const charge = event.data.object as StripeChargeObject

	if (charge.currency.toLowerCase() !== 'usd') {
		console.error(
			'[Stripe Webhook] Charge currency is not USD:',
			charge.currency,
		)
		return null
	}

	return charge.amount / 100
}
