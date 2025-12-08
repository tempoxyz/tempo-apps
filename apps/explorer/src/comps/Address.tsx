import { Link } from '@tanstack/react-router'
import type { Address as AddressType } from 'ox'
import { TruncatedHash } from '#comps/TruncatedHash'
import { cx } from '#cva.config'

export function Address(props: Address.Props) {
	const { address, chars, self, className } = props
	return (
		<>
			<div className="inline-block align-bottom press-down">
				<Link
					to="/address/$address"
					params={{ address }}
					title={address}
					className={cx('hover:underline', className)}
				>
					<TruncatedHash hash={address} minChars={chars} />
				</Link>
			</div>
			{self && <span className="text-tertiary"> (self)</span>}
		</>
	)
}

export namespace Address {
	export interface Props {
		address: AddressType.Address
		chars?: number
		self?: boolean
		className?: string
	}
}
