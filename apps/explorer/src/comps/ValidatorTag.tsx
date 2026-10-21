import type { Address as AddressType } from 'ox'
import type * as React from 'react'
import { Address } from '#comps/Address'

/** A block's validator, right-aligned and linking to its address. */
export function ValidatorTag(props: ValidatorTag.Props): React.JSX.Element {
	return <Address address={props.address} align="end" />
}

export declare namespace ValidatorTag {
	type Props = {
		address: AddressType.Address
	}
}
