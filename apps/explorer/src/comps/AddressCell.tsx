import { Hex } from '@tempoxyz/ds'
import type { Address as AddressType } from 'ox'
import type * as React from 'react'
import { Address } from '#comps/Address'

/** A table cell's address: a linked `Address`, or plain TDS `Hex`. */
export function AddressCell(props: AddressCell.Props): React.JSX.Element {
	const { address, label, asLink = true } = props
	if (!asLink) return <Hex value={address} />
	return (
		<Address
			address={address}
			title={`${label ? `${label}: ` : ''}${address}`}
		/>
	)
}

export declare namespace AddressCell {
	type Props = {
		address: AddressType.Address
		/** Prefixes the tooltip, such as `From`. */
		label?: string | undefined
		asLink?: boolean | undefined
	}
}
