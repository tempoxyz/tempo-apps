import type { Address } from 'ox'
import { cx } from '#cva.config.ts'

const TOKENLIST_BASE_URL = 'https://tokenlist.tempo.xyz/icon/42429'

export function TokenIcon(props: TokenIcon.Props) {
	const { address, className } = props
	return (
		<img
			src={`${TOKENLIST_BASE_URL}/${address}`}
			alt=''
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
