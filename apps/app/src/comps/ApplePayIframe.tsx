import * as React from 'react'
import { createPortal } from 'react-dom'
import { cx } from '#lib/css'
import XIcon from '~icons/lucide/x'

const COINBASE_PAY_ORIGIN = 'https://pay.coinbase.com'

type IframeMessage = {
	eventName:
		| 'onramp_api.load_success'
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
	const { url, className, onLoad, onCancel } = props
	const iframeRef = React.useRef<HTMLIFrameElement>(null)
	const placeholderRef = React.useRef<HTMLDivElement>(null)
	const [isLoaded, setIsLoaded] = React.useState(false)
	const [isExpanded, setIsExpanded] = React.useState(false)
	const [placeholderRect, setPlaceholderRect] = React.useState<DOMRect | null>(
		null,
	)

	React.useEffect(() => {
		if (!placeholderRef.current) return

		const updateRect = () => {
			if (placeholderRef.current) {
				setPlaceholderRect(placeholderRef.current.getBoundingClientRect())
			}
		}

		updateRect()
		window.addEventListener('resize', updateRect)
		window.addEventListener('scroll', updateRect)
		return () => {
			window.removeEventListener('resize', updateRect)
			window.removeEventListener('scroll', updateRect)
		}
	}, [])

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
				case 'onramp_api.load_success':
					setIsLoaded(true)
					onLoad?.()
					break
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
	}, [onLoad])

	if (!parsedUrl) {
		return (
			<div className={cx('flex items-center justify-center p-4', className)}>
				<p className="text-sm text-negative">Invalid payment URL</p>
			</div>
		)
	}

	const isMobileSafariBrowser = isMobileSafari()
	const shouldExpandFullscreen = isExpanded && !isMobileSafariBrowser

	return (
		<>
			{/* Placeholder to reserve space and measure position */}
			<div
				ref={placeholderRef}
				className={cx(
					'h-20 mb-3',
					!isLoaded && 'sr-only',
					shouldExpandFullscreen && 'invisible',
				)}
			/>

			{/* Always portal to body - position via CSS */}
			{createPortal(
				<div
					className={cx(
						shouldExpandFullscreen
							? 'fixed inset-0 z-100'
							: 'fixed z-100 pointer-events-auto bg-base-alt rounded-md p-3',
						!isLoaded && 'sr-only',
					)}
					style={
						!shouldExpandFullscreen && placeholderRect
							? {
									top: placeholderRect.top,
									left: placeholderRect.left,
									width: placeholderRect.width,
									height: placeholderRect.height,
								}
							: undefined
					}
				>
					{!shouldExpandFullscreen && onCancel && (
						<button
							type="button"
							onClick={onCancel}
							className="absolute top-1 right-1 size-4 flex items-center justify-center rounded-full text-tertiary hover:text-primary cursor-pointer transition-colors"
							title="Cancel"
						>
							<XIcon className="size-3" />
						</button>
					)}
					<iframe
						ref={iframeRef}
						src={iframeSrc ?? ''}
						title="Apple Pay Checkout"
						allow="payment"
						sandbox="allow-scripts allow-same-origin"
						referrerPolicy="no-referrer"
						className={cx('border-0 h-full w-full rounded-md', className)}
					/>
				</div>,
				document.body,
			)}
		</>
	)
}

export declare namespace ApplePayIframe {
	type Props = {
		url: string
		className?: string | undefined
		onLoad?: () => void
		onCancel?: () => void
	}
}
