import { Link } from '@tanstack/react-router'
import { style } from '@tempoxyz/ds/platform'
import type { Hex } from 'ox'
import { cx } from 'zyzz'
import { Midcut } from '#comps/Midcut'
import { pressDown } from '#styles/explorer'

export function TransactionCell(props: { hash: Hex.Hex }) {
	const { hash } = props
	return (
		<Link
			to="/receipt/$hash"
			params={{ hash }}
			preload="intent"
			{...cx(styles.link(), pressDown())}
		>
			<Midcut value={hash} prefix="0x" />
		</Link>
	)
}

namespace styles {
	export const link = style({
		color: 'content.tertiary',
		typography: 'body.b3',
		width: '100% !custom',
	})
}
