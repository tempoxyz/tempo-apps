import { Link } from '@tanstack/react-router'
import type { Address } from 'ox'
import * as AddressUtil from 'ox/Address'
import * as React from 'react'
import { Midcut } from '#comps/Midcut'

const TEMPO_API_FEE_PAYER = AddressUtil.from(
	'0x58aa7ce42e1d13b2919e2ac7e006c4fbc171442c',
)

export function FeePayer(props: FeePayer.Props): React.JSX.Element {
	const { address } = props
	const tooltipId = React.useId()

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
		<span className="group relative inline-flex">
			<button
				type="button"
				aria-describedby={tooltipId}
				className="inline-flex cursor-default items-center gap-[6px] rounded-full border border-accent/25 bg-accent/10 px-[9px] py-[3px] text-[12px] font-medium text-accent transition-colors group-hover:border-accent/40 group-hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				<span
					className="grid size-[10px] grid-cols-2 gap-px"
					aria-hidden="true"
				>
					<span className="rounded-[1px] bg-current" />
					<span className="rounded-[1px] bg-current" />
					<span className="rounded-[1px] bg-current" />
					<span className="rounded-[1px] bg-current" />
				</span>
				Tempo API
			</button>
			<span
				id={tooltipId}
				role="tooltip"
				className="absolute bottom-[calc(100%+8px)] left-1/2 z-50 hidden w-[224px] -translate-x-1/2 rounded-[8px] border border-base-border bg-base-background px-[10px] py-[8px] text-center text-[12px] leading-[17px] text-secondary shadow-[0_8px_24px_rgba(0,0,0,0.3)] before:absolute before:-bottom-[8px] before:left-0 before:h-[8px] before:w-full before:content-[''] group-hover:block group-focus-within:block"
			>
				Build faster with sponsored transactions from{' '}
				<a
					href="https://api.tempo.xyz"
					target="_blank"
					rel="noopener noreferrer"
					className="text-accent hover:underline focus-visible:outline-none focus-visible:underline"
				>
					Tempo API
				</a>
				.
			</span>
		</span>
	)
}

export declare namespace FeePayer {
	type Props = {
		address: Address.Address
	}
}
