import { Link } from '@tanstack/react-router'
import type { Hex } from 'ox'
import { TruncatedHash } from '#comps/TruncatedHash'

export function TransactionCell(props: { hash: Hex.Hex; chars?: number }) {
	const { hash, chars = 6 } = props
	return (
		<Link
			to="/receipt/$hash"
			params={{ hash }}
			className="text-[13px] text-tertiary press-down"
			title={hash}
		>
			<TruncatedHash hash={hash} minChars={chars} />
		</Link>
	)
}
