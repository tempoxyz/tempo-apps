import { Avatar, style } from '@tempoxyz/ds/platform'
import type { Address } from 'ox'
import * as React from 'react'
import { resolveLogoURI } from '#lib/domain/tip20'

const TOKEN_ICON_FALLBACK_SRC = '/token-fallback.svg'

/**
 * Decorative token logo. The TDS Avatar shows the token's own `logoURI` once
 * it loads. Until then, or when it is missing or broken, the fallback shows
 * the curated logo from `/api/token/logo`, then a generic coin.
 */
export function TokenIcon(props: TokenIcon.Props): React.JSX.Element {
	const { address, logoURI, size = 16 } = props

	return (
		<Avatar
			alt=""
			aria-hidden="true"
			fallback={<LogoFallback key={address} address={address} />}
			src={resolveLogoURI(logoURI)}
			style={{ height: size, width: size }}
		/>
	)
}

export declare namespace TokenIcon {
	type Props = {
		address: Address.Address
		logoURI?: string | null | undefined
		/** Width and height in pixels. */
		size?: number | undefined
	}
}

function LogoFallback(props: { address: Address.Address }): React.JSX.Element {
	const [src, setSrc] = React.useState(`/api/token/logo/${props.address}`)
	const imageRef = React.useRef<HTMLImageElement>(null)

	// Only the source that failed falls back, so the generic coin never retries.
	const fail = React.useCallback((failed: string) => {
		setSrc((current) =>
			current === failed ? TOKEN_ICON_FALLBACK_SRC : current,
		)
	}, [])

	React.useEffect(() => {
		// An SSR image can fail before React attaches its onError listener.
		const image = imageRef.current
		if (image?.complete && image.naturalWidth === 0) fail(src)
	}, [src, fail])

	return (
		<img
			ref={imageRef}
			src={src}
			alt=""
			{...styles.image()}
			onError={() => fail(src)}
		/>
	)
}

namespace styles {
	export const image = style({
		display: 'block',
		height: '100% !custom',
		objectFit: 'cover',
		width: '100% !custom',
	})
}
