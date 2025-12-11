import { Link } from '@tanstack/react-router'
import type { Address as AddressType } from 'ox'
import { Midcut } from '#comps/Midcut'
import { cx } from '#cva.config'

export function Address(props: Address.Props) {
	const { address, align, chars = 3, className, self } = props
	return (
		<>
			<Link
				to="/address/$address"
				params={{ address }}
				className={cx(className, 'flex-1 text-accent press-down')}
			>
				<Midcut align={align} min={chars} prefix="0x" value={address} />
			</Link>
			{self && <span className="text-tertiary"> (self)</span>}
		</>
	)
}

export namespace Address {
	export interface Props {
		address: AddressType.Address
		align?: Midcut.Props['align']
		chars?: number
		className?: string
		self?: boolean
	}
}
