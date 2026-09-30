import type { Address } from 'ox'
import * as React from 'react'
import { cx } from '#lib/css'
import { resolveLogoURI } from '#lib/domain/tip20'

const TOKEN_ICON_FALLBACK_SRC = '/token-fallback.svg'

export function TokenIcon(props: TokenIcon.Props) {
	const { address, className, logoURI } = props
	const fallbackSrc = `/api/token/logo/${address}`
	const primarySrc = resolveLogoURI(logoURI)
	const [src, setSrc] = React.useState(primarySrc ?? fallbackSrc)
	const imageRef = React.useRef<HTMLImageElement>(null)
	const handleError = React.useCallback(
		(failedSrc: string) => {
			setSrc((current) => {
				// Ignore stale errors after a token change, and never retry a
				// failed fallback asset in a loop.
				if (current !== failedSrc || current === TOKEN_ICON_FALLBACK_SRC)
					return current
				return current === fallbackSrc ? TOKEN_ICON_FALLBACK_SRC : fallbackSrc
			})
		},
		[fallbackSrc],
	)

	React.useEffect(() => {
		setSrc(primarySrc ?? fallbackSrc)
	}, [primarySrc, fallbackSrc])

	React.useEffect(() => {
		// An SSR image can fail before React attaches its onError listener.
		const image = imageRef.current
		if (image?.complete && image.naturalWidth === 0) handleError(src)
	}, [src, handleError])

	return (
		<img
			ref={imageRef}
			src={src}
			alt=""
			className={cx('size-4 rounded-full shrink-0', className)}
			onError={() => handleError(src)}
		/>
	)
}

export namespace TokenIcon {
	export interface Props {
		address: Address.Address
		name?: string
		className?: string
		logoURI?: string | null | undefined
	}
}
