import { Link } from '@tanstack/react-router'
import type { Address as AddressType } from 'ox'
import { HexFormatter } from '#lib/formatting'

export function Address(props: Address.Props) {
	const { address, chars, self, className } = props
	return (
		<>
			<Link
				to="/address/$address"
				params={{ address }}
				title={address}
				className={className}
			>
				{HexFormatter.shortenHex(address, chars)}
			</Link>
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
