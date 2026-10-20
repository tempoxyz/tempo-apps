import { Link } from '@tanstack/react-router'
import { style, Tag } from '@tempoxyz/ds'
import type { Address } from 'ox'
import * as AddressUtil from 'ox/Address'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Midcut } from '#comps/Midcut'
import { link, linkHover, pressDown } from '#styles/explorer'

const TEMPO_API_FEE_PAYER = AddressUtil.from(
	'0x58aa7ce42e1d13b2919e2ac7e006c4fbc171442c',
)

export function FeePayer(props: FeePayer.Props): React.JSX.Element {
	const { address } = props

	if (!AddressUtil.isEqual(address, TEMPO_API_FEE_PAYER)) {
		return (
			<Link
				to="/address/$address"
				params={{ address }}
				{...cx(styles.address(), link(), linkHover(), pressDown())}
				title={address}
			>
				<Midcut value={address} prefix="0x" min={4} align="end" />
			</Link>
		)
	}

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
		address: Address.Address
	}
}

namespace styles {
	export const address = style({
		maxWidth: '50ch !custom',
		typography: 'copy.14',
		width: '100% !custom',
	})

	export const glyph = style({
		display: 'grid',
		gap: '1px !custom',
		gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
		height: '10px !custom',
		width: '10px !custom',
	})

	export const glyphCell = style({ backgroundColor: 'currentColor !custom' })
}
