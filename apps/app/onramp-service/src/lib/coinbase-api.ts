import { createCoinbaseJwt } from './coinbase-jwt.js'

const COINBASE_API_HOST = 'api.cdp.coinbase.com'
const COINBASE_API_PATH = '/platform/v2/onramp/orders'

export type CreateOnrampOrderParams = {
	keyId: string
	keySecret: string
	destinationAddress: string
	destinationNetwork: 'base'
	domain: string
	email: string
	phoneNumber: string
	phoneNumberVerifiedAt: string
	purchaseAmount: string
	sandbox?: boolean
}

export type CreateOnrampOrderResult = {
	orderId: string
	type: 'apple' | 'card'
	url: string
}

const paymentLinkTypeMap: Record<string, 'apple' | 'card'> = {
	PAYMENT_LINK_TYPE_APPLE_PAY_BUTTON: 'apple',
	PAYMENT_LINK_TYPE_CARD: 'card',
}

export async function createOnrampOrder(
	params: CreateOnrampOrderParams,
): Promise<CreateOnrampOrderResult> {
	const {
		keyId,
		keySecret,
		destinationAddress,
		destinationNetwork,
		domain,
		email,
		phoneNumber,
		phoneNumberVerifiedAt,
		purchaseAmount,
		sandbox = false,
	} = params

	const jwt = await createCoinbaseJwt({
		keyId,
		keySecret,
		method: 'POST',
		host: COINBASE_API_HOST,
		path: COINBASE_API_PATH,
	})

	const partnerUserRef = sandbox
		? `sandbox-${destinationAddress}`
		: destinationAddress

	const body: Record<string, string> = {
		agreementAcceptedAt: new Date().toISOString(),
		destinationAddress,
		destinationNetwork,
		email,
		partnerUserRef,
		paymentCurrency: 'USD',
		paymentMethod: 'GUEST_CHECKOUT_APPLE_PAY',
		phoneNumber: phoneNumber.replace(/\s/g, ''),
		phoneNumberVerifiedAt,
		purchaseAmount,
		purchaseCurrency: 'USDC',
	}

	// Only include domain for production (HTTPS) domains
	// Localhost testing skips domain to avoid "not allowlisted" errors
	// Domain must be allowlisted in CDP Portal for production
	if (
		domain &&
		!domain.includes('localhost') &&
		!domain.includes('127.0.0.1')
	) {
		body.domain = domain
	}

	const url = `https://${COINBASE_API_HOST}${COINBASE_API_PATH}`
	console.log('[Coinbase API] Request:', {
		url,
		method: 'POST',
		body,
	})

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${jwt}`,
		},
		body: JSON.stringify(body),
	})

	const responseText = await response.text()
	console.log('[Coinbase API] Response:', {
		status: response.status,
		statusText: response.statusText,
		body: JSON.parse(responseText),
	})

	if (!response.ok) {
		throw new Error(`Coinbase API error: ${response.status} ${responseText}`)
	}

	const data = JSON.parse(responseText) as {
		order: { orderId: string }
		paymentLink: {
			paymentLinkType: string
			url: string
		}
	}

	const type = paymentLinkTypeMap[data.paymentLink.paymentLinkType] ?? 'card'

	return {
		orderId: data.order.orderId,
		type,
		url: data.paymentLink.url,
	}
}
