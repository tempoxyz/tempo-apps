import { Link } from '@tanstack/react-router'
import { Hex, style, variants } from '@tempoxyz/ds'
import type { Address as AddressType } from 'ox'
import { cx } from 'zyzz'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { link, linkHover, truncate } from '#styles/explorer'

/**
 * An address linking to its page: TDS `Hex`, middle-truncated to fit, or a
 * known name in its place.
 */
export function Address(props: Address.Props): React.JSX.Element {
	const { address, align, className, label, search, self, title } = props
	const { isHighlighted, handlers } = useAddressHighlight(address)

	const anchor = (children: React.ReactNode) => (
		<Link
			to="/address/$address"
			params={{ address }}
			search={search}
			title={title ?? (label ? address : undefined)}
			preload="intent"
			{...cx(
				styles.link(),
				link(),
				linkHover(),
				isHighlighted && styles.highlighted(),
			)}
			{...handlers}
		>
			{children}
		</Link>
	)

	return (
		<>
			{label ? (
				<span {...cx(styles.root({ className, align }), styles.named())}>
					{anchor(<span {...truncate()}>{label}</span>)}
				</span>
			) : (
				// The link sits inside `Hex.Root` so it takes the link color.
				<Hex.Root value={address} {...styles.root({ className, align })}>
					{anchor(<Hex.Text />)}
				</Hex.Root>
			)}
			{self && <span {...styles.self()}> (self)</span>}
		</>
	)
}

export declare namespace Address {
	type Props = {
		address: AddressType.Address
		/** `end` right-aligns the address in a full-width cell. */
		align?: 'start' | 'end' | undefined
		className?: string | undefined
		/** A known name shown instead of the address, such as a system contract's. */
		label?: string | undefined
		search?: Record<string, unknown> | undefined
		self?: boolean | undefined
		title?: string | undefined
	}
}

namespace styles {
	export const root = variants({
		base: { minWidth: '0 !custom' },
		defaultVariants: { align: 'start' },
		variants: {
			align: {
				start: {},
				end: { justifyContent: 'flex-end', width: '100% !custom' },
			},
		},
	})

	// `Hex.Root` is an inline flex box; a name gets the same box.
	export const named = style({
		display: 'inline-flex',
		maxWidth: '100% !custom',
	})

	export const link = style({
		display: 'inline-flex',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
	})

	export const highlighted = style({ textDecorationLine: 'underline' })

	export const self = style({ color: 'gray.900' })
}
