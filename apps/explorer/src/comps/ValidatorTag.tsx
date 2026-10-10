import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Address } from 'ox'
import { cx } from 'zyzz'
import { Midcut } from '#comps/Midcut'
import { link, linkHover, pressDown } from '#styles/explorer'

export function ValidatorTag(props: ValidatorTag.Props): React.JSX.Element {
	const { address } = props

	return (
		<Link
			to="/address/$address"
			params={{ address }}
			{...cx(styles.root(), link(), linkHover(), pressDown())}
			title={address}
		>
			<Midcut value={address} prefix="0x" align="end" min={4} />
		</Link>
	)
}

export declare namespace ValidatorTag {
	type Props = {
		address: Address.Address
	}
}

namespace styles {
	export const root = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		justifyContent: 'flex-end',
		minWidth: '0 !custom',
	})
}
