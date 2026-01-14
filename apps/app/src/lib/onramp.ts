import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

const COINBASE_PAY_ORIGIN = 'https://pay.coinbase.com'
const ONRAMP_API_URL =
	import.meta.env.VITE_ONRAMP_API_URL ?? 'http://localhost:8788'

export type OnrampEventName =
	| 'onramp_api.load_pending'
	| 'onramp_api.load_success'
	| 'onramp_api.load_error'
	| 'onramp_api.apple_pay_button_pressed'
	| 'onramp_api.cancel'
	| 'onramp_api.commit_success'
	| 'onramp_api.commit_error'
	| 'onramp_api.polling_start'
	| 'onramp_api.polling_success'
	| 'onramp_api.polling_error'

export type OnrampEvent = {
	eventName: OnrampEventName
	data?: unknown
}

export type OrderResult = {
	orderId: string
	type: 'apple' | 'card'
	url: string
}

export function useShowApplePay(): boolean {
	const [show, setShow] = React.useState(false)

	React.useEffect(() => {
		const ua = navigator.userAgent
		const isSafari = /^((?!chrome|android).)*safari/i.test(ua)
		const isMobile = /iPhone|iPad|iPod|Android/i.test(ua)
		const isInAppBrowser = /Instagram|FBAN|FBAV|TikTok/i.test(ua)

		if (isInAppBrowser) {
			setShow(false)
			return
		}

		if (isMobile && !isSafari) {
			setShow(false)
			return
		}

		setShow(true)
	}, [])

	return show
}

export type UseOnrampOrderProps = {
	address: string
	email?: string
	phoneNumber?: string
	phoneNumberVerifiedAt?: string
	onSuccess?: () => void
	onError?: (error: Error) => void
}

export function useOnrampOrder(props: UseOnrampOrderProps) {
	const { address, email, phoneNumber, phoneNumberVerifiedAt, onSuccess, onError } =
		props
	const queryClient = useQueryClient()
	const [orderEvents, setOrderEvents] = React.useState<OnrampEvent[]>([])
	const [iframeUrl, setIframeUrl] = React.useState<string | null>(null)

	const lastOrderEvent = orderEvents[orderEvents.length - 1]

	React.useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.origin !== COINBASE_PAY_ORIGIN) return

			try {
				const data = event.data as { eventName?: string; data?: unknown }
				if (
					typeof data?.eventName !== 'string' ||
					!data.eventName.startsWith('onramp_api.')
				) {
					return
				}

				const onrampEvent: OnrampEvent = {
					eventName: data.eventName as OnrampEventName,
					data: data.data,
				}

				setOrderEvents((prev) => [...prev, onrampEvent])

				if (onrampEvent.eventName === 'onramp_api.commit_success') {
					queryClient.invalidateQueries()
					onSuccess?.()
				}

				if (
					onrampEvent.eventName === 'onramp_api.commit_error' ||
					onrampEvent.eventName === 'onramp_api.load_error'
				) {
					onError?.(new Error(JSON.stringify(onrampEvent.data)))
				}
			} catch {
				// Ignore malformed messages
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [queryClient, onSuccess, onError])

	const createOrder = useMutation({
		mutationKey: ['onramp', 'createOrder', address],
		mutationFn: async (params: { amount: number }) => {
			setOrderEvents([])

			const body: Record<string, unknown> = {
				address,
				amount: params.amount,
			}
			if (email) body.email = email
			if (phoneNumber) body.phoneNumber = phoneNumber
			if (phoneNumberVerifiedAt) body.phoneNumberVerifiedAt = phoneNumberVerifiedAt

			const response = await fetch(`${ONRAMP_API_URL}/orders`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				throw new Error(
					(errorData as { error?: string }).error ??
						`Failed to create order: ${response.status}`,
				)
			}

			const result = (await response.json()) as OrderResult

			setIframeUrl(result.url)
			return result
		},
	})

	const reset = React.useCallback(() => {
		setOrderEvents([])
		setIframeUrl(null)
		createOrder.reset()
	}, [createOrder])

	return {
		createOrder,
		orderEvents,
		lastOrderEvent,
		iframeUrl,
		reset,
		isLoading:
			createOrder.isPending ||
			(iframeUrl !== null &&
				lastOrderEvent?.eventName !== 'onramp_api.commit_success' &&
				lastOrderEvent?.eventName !== 'onramp_api.commit_error' &&
				lastOrderEvent?.eventName !== 'onramp_api.cancel'),
	}
}

export declare namespace useOnrampOrder {
	type Props = UseOnrampOrderProps
	type Result = ReturnType<typeof useOnrampOrder>
}
