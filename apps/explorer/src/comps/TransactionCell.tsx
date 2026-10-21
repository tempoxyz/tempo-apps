import { Link } from '@tanstack/react-router'
import { Hex, style } from '@tempoxyz/ds'
import type { Hex as HexType } from 'ox'
import type * as React from 'react'

/** A transaction hash in TDS `Hex`, linking to its receipt. */
export function TransactionCell(
	props: TransactionCell.Props,
): React.JSX.Element {
	const { hash } = props
	return (
		<Hex.Root value={hash} {...styles.root()}>
			<Link
				to="/receipt/$hash"
				params={{ hash }}
				preload="intent"
				{...styles.link()}
			>
				<Hex.Text />
			</Link>
		</Hex.Root>
	)
}

export declare namespace TransactionCell {
	type Props = { hash: HexType.Hex }
}

namespace styles {
	export const root = style({ minWidth: '0 !custom' })

	// Secondary to the row's own link, so it reads in gray.
	export const link = style({
		color: 'gray.900',
		display: 'inline-flex',
		maxWidth: '100% !custom',
		minWidth: '0 !custom',
		textDecorationLine: 'none',
		'@media (hover: hover)': { ':hover': { color: 'foreground' } },
	})
}
