import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { Midcut } from '#comps/Midcut'
import { cx } from '#lib/css'

export function AddressCell(props: {
	address: Address.Address
	label?: string
	asLink?: boolean
}) {
	const { address, label, asLink = true } = props
	const { isHighlighted, handlers } = useAddressHighlight(address)
	const title = `${label ? `${label}: ` : ''}${address}`

	if (!asLink)
		return (
			<span
				className={cx(
					'text-[13px] text-accent w-full font-mono',
					isHighlighted && 'underline',
				)}
				title={title}
				{...handlers}
			>
				<Midcut value={address} prefix="0x" />
			</span>
		)

	return (
		<Link
			to="/address/$address"
			params={{ address }}
			className={cx(
				'text-[13px] text-accent hover:text-accent/80 transition-colors press-down w-full font-mono',
				isHighlighted && 'underline',
			)}
			title={title}
			{...handlers}
		>
			<Midcut value={address} prefix="0x" />
		</Link>
	)
}
