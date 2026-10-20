import { ChoiceGroup } from '@tempoxyz/ds'
import type * as React from 'react'

/** A TDS small `ChoiceGroup` for toolbars, labelled by `label`. */
export function Choices<const value extends string>(
	props: Choices.Props<value>,
): React.JSX.Element {
	const { className, items, label, onChange, style, value, ...rest } = props

	return (
		<ChoiceGroup.Root<value | null>
			{...rest}
			aria-label={label}
			className={className}
			onValueChange={(next) => {
				if (next !== null && next !== value) onChange(next)
			}}
			size="small"
			style={style}
			value={value ?? null}
		>
			{items.map((item) => (
				<ChoiceGroup.Item
					disabled={item.disabled}
					key={item.value}
					value={item.value}
				>
					{item.label}
				</ChoiceGroup.Item>
			))}
		</ChoiceGroup.Root>
	)
}

export declare namespace Choices {
	type Item<value extends string = string> = {
		disabled?: boolean | undefined
		label: React.ReactNode
		value: value
	}

	type Props<value extends string = string> = Omit<
		React.HTMLAttributes<HTMLDivElement>,
		'children' | 'className' | 'defaultValue' | 'onChange' | 'style'
	> & {
		className?: string | undefined
		items: readonly Item<value>[]
		/** Accessible label for the group. */
		label: string
		onChange: (value: value) => void
		style?: React.CSSProperties | undefined
		/** Selected value. Leave undefined when nothing is selected. */
		value?: value | undefined
	}
}
