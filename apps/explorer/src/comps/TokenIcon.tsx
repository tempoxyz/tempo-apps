import type { Address } from 'ox'
import * as React from 'react'
import { cx } from '#lib/css'
import { resolveLogoURI } from '#lib/domain/tip20'

export function TokenIcon(props: TokenIcon.Props) {
	const { address, className, logoURI } = props
	const fallbackSrc = `/api/token/logo/${address}`
	const primarySrc = resolveLogoURI(logoURI)
	const [src, setSrc] = React.useState(primarySrc ?? fallbackSrc)

	React.useEffect(() => {
		setSrc(primarySrc ?? fallbackSrc)
	}, [primarySrc, fallbackSrc])

	return (
		<img
			src={src}
			alt=""
			className={cx('size-4 rounded-full shrink-0', className)}
			onError={(e) => {
				if (e.currentTarget.src !== fallbackSrc) {
					setSrc(fallbackSrc)
					return
				}
				e.currentTarget.style.display = 'none'
			}}
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
