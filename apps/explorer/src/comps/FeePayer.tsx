import { style, Tag } from '@tempoxyz/ds'
import type { Address as OxAddress } from 'ox'
import * as AddressUtil from 'ox/Address'
import type * as React from 'react'
import { Address } from '#comps/Address'

const TEMPO_API_FEE_PAYER = AddressUtil.from(
	'0x58aa7ce42e1d13b2919e2ac7e006c4fbc171442c',
)

/** The account that sponsored a transaction's network fee. */
export function FeePayer(props: FeePayer.Props): React.JSX.Element {
	const { address } = props

	if (!AddressUtil.isEqual(address, TEMPO_API_FEE_PAYER))
		return <Address address={address} />

	return (
		<Tag
			render={
				// biome-ignore lint/a11y/useAnchorContent: Tag renders its children inside the link.
				<a
					href="https://api.tempo.xyz"
					rel="noopener noreferrer"
					target="_blank"
				/>
			}
			variant="outlined"
		>
			<span {...styles.glyph()} aria-hidden="true">
				<span {...styles.glyphCell()} />
				<span {...styles.glyphCell()} />
				<span {...styles.glyphCell()} />
				<span {...styles.glyphCell()} />
			</span>
			Tempo API
		</Tag>
	)
}

export declare namespace FeePayer {
	type Props = {
		address: OxAddress.Address
	}
}

namespace styles {
	// The Tempo API mark: a 2×2 grid of squares in the tag's text color.
	export const glyph = style({
		display: 'grid',
		gap: '1',
		gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
		height: '10px !custom',
		width: '10px !custom',
	})

	export const glyphCell = style({ backgroundColor: 'currentColor !custom' })
}
