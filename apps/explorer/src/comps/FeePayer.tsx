import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import * as AddressUtil from 'ox/Address'
import type * as React from 'react'
import { Midcut } from '#comps/Midcut'

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
				className="text-[13px] text-accent hover:underline press-down w-full font-mono max-w-[50ch]"
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
			className="inline-flex items-center gap-[6px] rounded-full border border-accent/25 bg-accent/10 px-[9px] py-[3px] text-[12px] font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			<span className="grid size-[10px] grid-cols-2 gap-px" aria-hidden="true">
				<span className="rounded-[1px] bg-current" />
				<span className="rounded-[1px] bg-current" />
				<span className="rounded-[1px] bg-current" />
				<span className="rounded-[1px] bg-current" />
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
