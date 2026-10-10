import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address } from 'ox'
import { cx } from 'zyzz'
import { Midcut } from '#comps/Midcut'
import { link, linkHover, pressDown } from '#styles/explorer'

export function ValidatorTag(props: ValidatorTag.Props) {
	const { address, name, showAddress = true, align = 'end' } = props

	return (
		<Link
			to="/address/$address"
			params={{ address }}
			{...cx(styles.root(), link(), linkHover(), pressDown())}
			title={address}
		>
			{name && <span {...styles.name()}>{name}</span>}
			{showAddress && (
				<span {...styles.address()}>
					<Midcut value={address} prefix="0x" align={align} min={4} />
				</span>
			)}
		</Link>
	)
}

export namespace ValidatorTag {
	export interface Props {
		address: Address.Address
		name?: string
		showAddress?: boolean
		align?: 'start' | 'end'
	}
}

namespace styles {
	export const root = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		gap: '8',
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
	})

	export const name = style({
		backgroundColor: 'container.subtle',
		borderRadius: '3xs',
		color: 'content.tertiary',
		paddingBlock: '2',
		paddingInline: '8',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
	})

	export const address = style({
		fontFamily: '"JetBrains Mono", monospace',
		fontWeight: 400,
		letterSpacing: '0px',
	})
}
