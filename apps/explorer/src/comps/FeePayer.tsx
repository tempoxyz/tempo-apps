import { Link } from '@tanstack/react-router'
import { Badge, style } from '@tempoxyz/ds/platform'
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
		<a
			href="https://api.tempo.xyz"
			target="_blank"
			rel="noopener noreferrer"
			{...styles.badgeLink()}
		>
			<Badge scale="small" variant="outline">
				<span {...styles.glyph()} aria-hidden="true">
					<span {...styles.glyphCell()} />
					<span {...styles.glyphCell()} />
					<span {...styles.glyphCell()} />
					<span {...styles.glyphCell()} />
				</span>
				Tempo API
			</Badge>
		</a>
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
		typography: 'mono.inline',
		width: '100% !custom',
	})

	// Wraps a small TDS Badge, which renders a span; the ring follows its
	// corners.
	export const badgeLink = style({
		borderRadius: '6px !custom',
		display: 'inline-flex',
		'@media (hover: hover)': {
			selectors: {
				'&:hover > span': { backgroundColor: 'container.regular' },
			},
		},
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
