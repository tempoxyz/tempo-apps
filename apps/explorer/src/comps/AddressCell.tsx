import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import { Midcut } from '#comps/Midcut'

export function AddressCell(props: {
	address: Address.Address
	label?: string
	asLink?: boolean
}) {
	const { address, label, asLink = true } = props
	const title = `${label ? `${label}: ` : ''}${address}`

	if (!asLink)
		return (
			<span className="text-[13px] text-accent w-full font-mono" title={title}>
				<Midcut value={address} prefix="0x" />
			</span>
		)

	return (
		<Link
			to="/address/$address"
			params={{ address }}
			className="text-[13px] text-accent hover:text-accent/80 transition-colors press-down w-full font-mono"
			title={title}
		>
			<Midcut value={address} prefix="0x" />
		</Link>
	)
}
