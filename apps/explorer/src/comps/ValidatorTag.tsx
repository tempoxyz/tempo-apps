import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import { Midcut } from '#comps/Midcut'
import { getValidatorLabel } from '#lib/validators'

export function ValidatorTag(props: ValidatorTag.Props) {
	const { address, showAddress = true, align = 'end' } = props
	const name = getValidatorLabel(address)

	return (
		<Link
			to="/address/$address"
			params={{ address }}
			className="text-accent hover:underline press-down min-w-0 flex-1 flex items-center gap-2 justify-end"
			title={address}
		>
			{name && (
				<span className="text-[11px] px-[6px] py-[2px] rounded bg-base-alt/65 text-tertiary whitespace-nowrap">
					{name}
				</span>
			)}
			{showAddress && (
				<span className="font-mono">
					<Midcut value={address} prefix="0x" align={align} min={4} />
				</span>
			)}
		</Link>
	)
}

export namespace ValidatorTag {
	export interface Props {
		address: Address.Address
		showAddress?: boolean
		align?: 'start' | 'end'
	}
}
