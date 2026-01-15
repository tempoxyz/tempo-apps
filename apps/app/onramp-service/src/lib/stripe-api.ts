const STRIPE_API_BASE = 'https://api.stripe.com/v1'

export type CreatePaymentIntentParams = {
	secretKey: string
	destinationAddress: string
	amount: number
	email?: string
	environment: string
}

export type CreatePaymentIntentResult = {
	paymentIntentId: string
	clientSecret: string
	amount: number
}

export async function createPaymentIntent(
	params: CreatePaymentIntentParams,
): Promise<CreatePaymentIntentResult> {
	const { secretKey, destinationAddress, amount, email, environment } = params

	const amountInCents = Math.round(amount * 100)

	const body = new URLSearchParams({
		amount: amountInCents.toString(),
		currency: 'usd',
		'payment_method_types[]': 'card',
		'metadata[destinationAddress]': destinationAddress,
		'metadata[amount]': amount.toString(),
		'metadata[environment]': environment,
	})

	if (email) {
		body.append('receipt_email', email)
	}

	console.log('[Stripe API] Creating PaymentIntent:', {
		amount: amountInCents,
		destinationAddress,
		environment,
	})

	const response = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${btoa(`${secretKey}:`)}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	})

	const responseText = await response.text()

	if (!response.ok) {
		console.error('[Stripe API] Error:', responseText)
		throw new Error(`Stripe API error: ${response.status} ${responseText}`)
	}

	const data = JSON.parse(responseText) as {
		id: string
		client_secret: string
		amount: number
	}

	console.log('[Stripe API] Created PaymentIntent:', data.id)

	return {
		paymentIntentId: data.id,
		clientSecret: data.client_secret,
		amount: data.amount / 100,
	}
}
