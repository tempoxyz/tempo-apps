import { Link } from '@tanstack/react-router'
import type { Hex } from 'ox'
import { Midcut } from '#comps/Midcut'

export function TransactionCell(props: { hash: Hex.Hex }) {
	const { hash } = props
	return (
		<Link
			to="/receipt/$hash"
			params={{ hash }}
			className="text-[13px] text-tertiary press-down w-full"
		>
			<Midcut value={hash} prefix="0x" />
		</Link>
	)
}
