import type * as React from 'react'
import { Choices } from '#comps/ui/Choices'

type StatusValue = 'all' | 'success' | 'reverted'

const options: { value: StatusValue; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'success', label: 'Success' },
	{ value: 'reverted', label: 'Failed' },
]

export function TxStatusFilter(props: TxStatusFilter.Props): React.JSX.Element {
	const { value = 'all', onChange } = props

	return (
		<Choices
			label="Transaction status"
			value={value}
			items={options}
			scale="small"
			onChange={(next) => onChange(next === 'all' ? undefined : next)}
		/>
	)
}

export declare namespace TxStatusFilter {
	type Props = {
		value?: 'success' | 'reverted' | undefined
		onChange: (status: 'success' | 'reverted' | undefined) => void
	}
}
