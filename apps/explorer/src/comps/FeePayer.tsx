import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address } from 'ox'
import * as AddressUtil from 'ox/Address'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Midcut } from '#comps/Midcut'
import { link, linkHover, pressDown, transitionColors } from '#styles/explorer'

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
			{...cx(styles.badge(), transitionColors())}
		>
			<span {...styles.glyph()} aria-hidden="true">
				<span {...styles.glyphCell()} />
				<span {...styles.glyphCell()} />
				<span {...styles.glyphCell()} />
				<span {...styles.glyphCell()} />
			</span>
			Tempo API
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

	// Mirrors a small outline TDS Badge; Badge renders a span, not a link.
	export const badge = style({
		alignItems: 'center',
		backgroundColor: 'container.regular',
		borderColor: 'line.secondary',
		borderRadius: 'full',
		borderWidth: 'regular',
		color: 'content.primary',
		display: 'inline-flex',
		gap: '4',
		paddingBlock: '4',
		paddingInline: '8',
		typography: 'body.b3',
		'@media (hover: hover)': {
			':hover': {
				backgroundColor: 'container.strong',
				borderColor: 'line.primary',
			},
		},
		// The document focus ring squares focused links off at 8px.
		':focus-visible': { borderRadius: 'full' },
	})

	export const glyph = style({
		display: 'grid',
		gap: '1px !custom',
		gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
		height: '10px !custom',
		width: '10px !custom',
	})

	export const glyphCell = style({
		backgroundColor: 'currentColor !custom',
		borderRadius: '1px !custom',
	})
}
