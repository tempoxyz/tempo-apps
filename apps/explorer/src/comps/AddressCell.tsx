import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import { TruncatedHash } from '#comps/TruncatedHash'

export function AddressCell(props: {
	address: Address.Address
	label?: string
	asLink?: boolean
	chars?: number
}) {
	const { address, label, asLink = true, chars = 8 } = props
	const title = `${label ? `${label}: ` : ''}${address}`

	if (!asLink)
		return (
			<span className="text-[13px] text-accent" title={title}>
				<TruncatedHash hash={address} minChars={chars} />
			</span>
		)

	return (
		<Link
			to="/address/$address"
			params={{ address }}
			className="text-[13px] text-accent hover:text-accent/80 transition-colors press-down"
			title={title}
		>
			<TruncatedHash hash={address} minChars={chars} />
		</Link>
	)
}
