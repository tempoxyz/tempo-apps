import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address as AddressType } from 'ox'
import { cx } from 'zyzz'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { Midcut } from '#comps/Midcut'
import { link, linkHover, mono, pressDown } from '#styles/explorer'

export function Address(props: Address.Props) {
	const { address, align, chars = 3, className, search, self, title } = props
	const { isHighlighted, handlers } = useAddressHighlight(address)
	return (
		<>
			<Link
				to="/address/$address"
				params={{ address }}
				search={search}
				title={title}
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
				<Midcut align={align} min={chars} prefix="0x" value={address} />
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
		search?: Record<string, unknown>
		self?: boolean
		title?: string
	}
}

namespace styles {
	export const link = style({
		display: 'inline-flex',
		minWidth: '0 !custom',
	})

	export const end = style({
		justifyContent: 'flex-end',
		width: '100% !custom',
	})

	export const highlighted = style({ textDecorationLine: 'underline' })

	export const self = style({ color: 'content.secondary' })
}
