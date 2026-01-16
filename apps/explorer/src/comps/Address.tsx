import { Link } from '@tanstack/react-router'
import type { Address as AddressType } from 'ox'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { Midcut } from '#comps/Midcut'
import { cx } from '#lib/css'

export function Address(props: Address.Props) {
	const { address, align, chars = 3, className, self } = props
	const { isHighlighted, handlers } = useAddressHighlight(address)
	return (
		<>
			<Link
				to="/address/$address"
				params={{ address }}
				className={cx(
					'text-accent press-down hover:underline font-mono inline-flex min-w-0',
					align === 'end' && 'w-full justify-end',
					isHighlighted && 'underline',
					className,
				)}
				{...handlers}
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
