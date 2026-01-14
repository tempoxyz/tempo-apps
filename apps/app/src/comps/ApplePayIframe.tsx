import * as React from 'react'
import { cx } from '#lib/css'

const COINBASE_PAY_ORIGIN = 'https://pay.coinbase.com'

export function ApplePayIframe(props: ApplePayIframe.Props) {
	const { url, onClose, className } = props
	const iframeRef = React.useRef<HTMLIFrameElement>(null)

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

	if (!parsedUrl) {
		return (
			<div className={cx('flex items-center justify-center p-4', className)}>
				<p className="text-sm text-negative">Invalid payment URL</p>
			</div>
		)
	}

	const iframeSrc = React.useMemo(() => {
		if (!parsedUrl) return null
		const urlObj = new URL(parsedUrl)
		if (import.meta.env.DEV) {
			urlObj.searchParams.set('useApplePaySandbox', 'true')
		}
		return urlObj.toString()
	}, [parsedUrl])

	return (
		<div className={cx('relative w-full', className)}>
			<button
				type="button"
				onClick={onClose}
				className="absolute top-2 right-2 z-10 text-[11px] text-secondary hover:text-primary cursor-pointer press-down"
			>
				Cancel
			</button>
			<iframe
				ref={iframeRef}
				src={iframeSrc ?? ''}
				title="Apple Pay Checkout"
				allow="payment"
				className="w-full h-[500px] border-0 rounded-lg"
			/>
		</div>
	)
}

export declare namespace ApplePayIframe {
	type Props = {
		url: string
		onClose: () => void
		className?: string | undefined
	}
}
