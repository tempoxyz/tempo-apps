import * as React from 'react'
import { cx } from '#lib/css'

const COINBASE_PAY_ORIGIN = 'https://pay.coinbase.com'

type IframeMessage = {
	eventName:
		| 'onramp_api.apple_pay_button_pressed'
		| 'onramp_api.polling_start'
		| 'onramp_api.polling_success'
		| 'onramp_api.polling_failure'
		| 'onramp_api.apple_pay_session_cancelled'
		| 'onramp_api.cancel'
	data?: unknown
}

function isMobileSafari(): boolean {
	if (typeof navigator === 'undefined') return false
	const ua = navigator.userAgent
	return (
		/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
	)
}

export function ApplePayIframe(props: ApplePayIframe.Props) {
	const { url, className } = props
	const iframeRef = React.useRef<HTMLIFrameElement>(null)
	const [isExpanded, setIsExpanded] = React.useState(false)

	const parsedUrl = React.useMemo(() => {
		try {
			const parsed = new URL(url)
			if (parsed.origin !== COINBASE_PAY_ORIGIN) {
				console.error(
					`Invalid iframe origin: ${parsed.origin}. Expected ${COINBASE_PAY_ORIGIN}`,
				)
				return null
			}
			return url
		} catch {
			console.error('Invalid URL provided to ApplePayIframe')
			return null
		}
	}, [url])

	const iframeSrc = React.useMemo(() => {
		if (!parsedUrl) return null
		const urlObj = new URL(parsedUrl)
		if (import.meta.env.DEV) {
			// urlObj.searchParams.set('useApplePaySandbox', 'true')
			console.log('[debug] not setting useApplePaySandbox')
		}
		return urlObj.toString()
	}, [parsedUrl])

	React.useEffect(() => {
		function handleMessage(event: MessageEvent) {
			if (event.origin !== COINBASE_PAY_ORIGIN) return

			console.log('[ApplePayIframe] raw message:', event.data)

			let message: IframeMessage
			try {
				message =
					typeof event.data === 'string' ? JSON.parse(event.data) : event.data
			} catch {
				return
			}

			if (!message?.eventName) return

			console.log(
				'[ApplePayIframe] received event:',
				message.eventName,
				message.data,
			)

			switch (message.eventName) {
				case 'onramp_api.apple_pay_button_pressed':
				case 'onramp_api.polling_start':
					setIsExpanded(true)
					break
				case 'onramp_api.polling_success':
				case 'onramp_api.polling_failure':
				case 'onramp_api.apple_pay_session_cancelled':
				case 'onramp_api.cancel':
					setIsExpanded(false)
					break
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [])

	if (!parsedUrl) {
		return (
			<div className={cx('flex items-center justify-center p-4', className)}>
				<p className="text-sm text-negative">Invalid payment URL</p>
			</div>
		)
	}

	const isMobileSafariBrowser = isMobileSafari()

	return (
		<iframe
			ref={iframeRef}
			src={iframeSrc ?? ''}
			title="Apple Pay Checkout"
			allow="payment"
			sandbox="allow-scripts allow-same-origin"
			referrerPolicy="no-referrer"
			className={cx(
				'border-0',
				isExpanded
					? isMobileSafariBrowser
						? 'sr-only'
						: 'fixed inset-0 z-100 h-full! w-full'
					: 'h-12.5 w-full',
				className,
			)}
		/>
	)
}

export declare namespace ApplePayIframe {
	type Props = {
		url: string
		className?: string | undefined
	}
}
