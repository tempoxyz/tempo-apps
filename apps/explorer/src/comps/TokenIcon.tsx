import type { Address } from 'ox'
import { cx } from '#lib/css'
import { TOKENLIST_BASE_URL } from '#lib/tokenlist'
import { getTempoChain } from '#wagmi.config'

const TOKEN_ICON_BASE_URL = `${TOKENLIST_BASE_URL}/icon/${getTempoChain().id}`

export function TokenIcon(props: TokenIcon.Props) {
	const { address, className } = props
	return (
		<img
			src={`${TOKEN_ICON_BASE_URL}/${address}`}
			alt=""
			className={cx('size-4 rounded-full shrink-0', className)}
			onError={(e) => {
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
	}
}
