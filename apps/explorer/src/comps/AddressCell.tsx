import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds'
import type { Address } from 'ox'
import { cx } from 'zyzz'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { Midcut } from '#comps/Midcut'
import {
	link,
	linkHover,
	mono,
	pressDown,
	transitionColors,
} from '#styles/explorer'

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
				{...cx(
					styles.address(),
					mono(),
					link(),
					isHighlighted && styles.highlighted(),
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
			preload="intent"
			{...cx(
				styles.address(),
				mono(),
				link(),
				linkHover(),
				transitionColors(),
				pressDown(),
				isHighlighted && styles.highlighted(),
			)}
			title={title}
			{...handlers}
		>
			<Midcut value={address} prefix="0x" />
		</Link>
	)
}

namespace styles {
	// The mono face at the table's size.
	export const address = style({ width: '100% !custom' })

	export const highlighted = style({ textDecorationLine: 'underline' })
}
