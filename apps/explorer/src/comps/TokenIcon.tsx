import type { Address } from 'ox'
import * as React from 'react'
import { cx } from '#lib/css'
import { resolveLogoURI } from '#lib/domain/tip20'
import { TOKENLIST_BASE_URL } from '#lib/tokenlist'
import { getTempoChain } from '#wagmi.config'

const TOKEN_ICON_BASE_URL = `${TOKENLIST_BASE_URL}/icon/${getTempoChain().id}`

export function TokenIcon(props: TokenIcon.Props) {
	const { address, className, logoURI } = props
	const fallbackSrc = `${TOKEN_ICON_BASE_URL}/${address}`
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
