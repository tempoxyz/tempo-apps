import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import { useAddressHighlight } from '#comps/AddressHighlight'
import { Midcut } from 'midcut'
import { cx } from '#lib/css'
import { getContractInfo } from '#lib/domain/contracts'

export function AddressCell(props: {
	address: Address.Address
	label?: string
	asLink?: boolean
}) {
	const { address, label, asLink = true } = props
	const { isHighlighted, handlers } = useAddressHighlight(address)
	const contractInfo = getContractInfo(address)
	const title = `${label ? `${label}: ` : ''}${contractInfo ? `${contractInfo.name}: ` : ''}${address}`

	const contractLabel = contractInfo && (
		<span className="text-[11px] px-[6px] py-[2px] rounded bg-base-alt/65 text-tertiary whitespace-nowrap mr-[4px] font-sans">
			{contractInfo.name}
		</span>
	)

	if (!asLink)
		return (
			<span
				className={cx(
					'text-[13px] text-accent w-full inline-flex items-center',
					isHighlighted && 'underline',
				)}
				title={title}
				{...handlers}
			>
				{contractLabel}
				<span className="font-mono">
					<Midcut value={address} prefix="0x" />
				</span>
			</span>
		)

	return (
		<span className="inline-flex items-center w-full">
			{contractLabel}
			<Link
				to="/address/$address"
				params={{ address }}
				className={cx(
					'text-[13px] text-accent hover:text-accent/80 transition-colors press-down font-mono',
					isHighlighted && 'underline',
				)}
				title={title}
				{...handlers}
			>
				<Midcut value={address} prefix="0x" />
			</Link>
		</span>
	)
}
