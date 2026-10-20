import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds'
import type { Address as AddressType } from 'ox'
import { cx } from 'zyzz'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { Midcut } from '#comps/Midcut'
import { link, linkHover, mono, pressDown, truncate } from '#styles/explorer'

export function Address(props: Address.Props) {
	const {
		address,
		align,
		chars = 3,
		className,
		label,
		search,
		self,
		title,
	} = props
	const { isHighlighted, handlers } = useAddressHighlight(address)
	return (
		<>
			<Link
				to="/address/$address"
				params={{ address }}
				search={search}
				title={title ?? (label ? address : undefined)}
				preload="intent"
				{...cx(
					styles.link({ className }),
					mono(),
					link(),
					linkHover(),
					pressDown(),
					align === 'end' && styles.end(),
					isHighlighted && styles.highlighted(),
				)}
				{...handlers}
			>
				{label ? (
					<span {...cx(styles.label(), truncate())}>{label}</span>
				) : (
					<Midcut align={align} min={chars} prefix="0x" value={address} />
				)}
			</Link>
			{self && <span {...styles.self()}> (self)</span>}
		</>
	)
}

export namespace Address {
	export interface Props {
		address: AddressType.Address
		align?: Midcut.Props['align']
		chars?: number
		className?: string
		/** A known name shown instead of the address, such as a system contract's. */
		label?: string | undefined
		search?: Record<string, unknown>
		self?: boolean
		title?: string
	}
}

namespace styles {
	// A known name reads as text, not as a mono address.
	export const label = style({
		fontFamily: 'sans',
		letterSpacing: 'normal',
	})

	export const link = style({
		display: 'inline-flex',
		minWidth: '0 !custom',
	})

	export const end = style({
		justifyContent: 'flex-end',
		width: '100% !custom',
	})

	export const highlighted = style({ textDecorationLine: 'underline' })

	export const self = style({ color: 'gray.900' })
}
