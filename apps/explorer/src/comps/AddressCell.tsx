import { Link } from '@tanstack/react-router'
import { vars as core } from '@tempoxyz/ds/core'
import { style } from '@tempoxyz/ds/platform'
import type { Address } from 'ox'
import { cx } from 'zyzz'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { Midcut } from '#comps/Midcut'
import { link, pressDown, transitionColors } from '#styles/explorer'

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
				{...cx(styles.address(), link(), isHighlighted && styles.highlighted())}
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
				link(),
				styles.linkHover(),
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
	export const address = style({
		typography: 'mono.inline',
		width: '100% !custom',
	})

	export const linkHover = style({
		'@media (hover: hover)': {
			':hover': {
				color: `color-mix(in oklab, light-dark(${core.color.accent.blueLight}, ${core.color.accent.blueDark}) 80%, transparent) !custom`,
			},
		},
	})

	export const highlighted = style({ textDecorationLine: 'underline' })
}
