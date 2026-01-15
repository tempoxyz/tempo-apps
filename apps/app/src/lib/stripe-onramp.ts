import * as React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { loadStripe, type Stripe } from '@stripe/stripe-js'

const ONRAMP_API_URL =
	import.meta.env.VITE_ONRAMP_API_URL ?? 'http://localhost:8788'

export type StripeConfig = {
	publishableKey: string
}

export type PaymentIntentResult = {
	paymentIntentId: string
	clientSecret: string
	amount: number
}

export type UseStripeOnrampProps = {
	address: string
	email?: string
	onSuccess?: () => void
	onError?: (error: Error) => void
}

let stripePromise: Promise<Stripe | null> | null = null

async function getStripeConfig(): Promise<StripeConfig> {
	const response = await fetch(`${ONRAMP_API_URL}/stripe/config`)
	if (!response.ok) {
		throw new Error('Failed to fetch Stripe config')
	}
	return response.json() as Promise<StripeConfig>
}

export function useStripeConfig() {
	return useQuery({
		queryKey: ['stripe', 'config'],
		queryFn: getStripeConfig,
		staleTime: Number.POSITIVE_INFINITY,
	})
}

export function useStripeInstance() {
	const { data: config } = useStripeConfig()

	React.useEffect(() => {
		if (config?.publishableKey && !stripePromise) {
			stripePromise = loadStripe(config.publishableKey)
		}
	}, [config?.publishableKey])

	return React.useMemo(() => {
		if (!config?.publishableKey) return null
		if (!stripePromise) {
			stripePromise = loadStripe(config.publishableKey)
		}
		return stripePromise
	}, [config?.publishableKey])
}

export function useStripeOnramp(props: UseStripeOnrampProps) {
	const { address, email, onSuccess, onError } = props
	const [clientSecret, setClientSecret] = React.useState<string | null>(null)
	const [paymentStatus, setPaymentStatus] = React.useState<
		'idle' | 'processing' | 'succeeded' | 'failed'
	>('idle')

	const createPaymentIntent = useMutation({
		mutationKey: ['stripe', 'createPaymentIntent', address],
		mutationFn: async (params: { amount: number }) => {
			setPaymentStatus('processing')

			const body: Record<string, unknown> = {
				address,
				amount: params.amount,
			}
			if (email) body.email = email

			const response = await fetch(`${ONRAMP_API_URL}/stripe/payment-intents`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				throw new Error(
					(errorData as { error?: string }).error ??
						`Failed to create payment intent: ${response.status}`,
				)
			}

			const result = (await response.json()) as PaymentIntentResult
			setClientSecret(result.clientSecret)
			return result
		},
		onError: (error) => {
			setPaymentStatus('failed')
			onError?.(error)
		},
	})

	const handlePaymentSuccess = React.useCallback(() => {
		setPaymentStatus('succeeded')
		onSuccess?.()
	}, [onSuccess])

	const handlePaymentError = React.useCallback(
		(error: Error) => {
			setPaymentStatus('failed')
			onError?.(error)
		},
		[onError],
	)

	const reset = React.useCallback(() => {
		setClientSecret(null)
		setPaymentStatus('idle')
		createPaymentIntent.reset()
	}, [createPaymentIntent])

	return {
		createPaymentIntent,
		clientSecret,
		paymentStatus,
		reset,
		handlePaymentSuccess,
		handlePaymentError,
		isLoading: createPaymentIntent.isPending || paymentStatus === 'processing',
	}
}

export declare namespace useStripeOnramp {
	type Props = UseStripeOnrampProps
	type Result = ReturnType<typeof useStripeOnramp>
}
