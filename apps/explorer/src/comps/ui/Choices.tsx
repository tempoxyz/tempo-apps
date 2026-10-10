import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { style } from '@tempoxyz/ds/platform'
import type * as React from 'react'

/**
 * Segmented radio group in the Tempo Design System style. TDS's own
 * SegmentedControl takes exactly three items; the explorer needs two to four.
 */
export function Choices<const value extends string>(
	props: Choices.Props<value>,
): React.JSX.Element {
	const {
		className,
		items,
		label,
		onChange,
		style: inlineStyle,
		value,
		...rest
	} = props

	return (
		<RadioGroup<value | null>
			aria-label={label}
			onValueChange={(next) => {
				if (next === null) return
				if (next !== value) onChange(next)
			}}
			value={value ?? null}
			{...rest}
			{...styles.root({ className, style: inlineStyle })}
		>
			{items.map((item) => (
				<Radio.Root
					disabled={item.disabled}
					key={item.value}
					nativeButton
					onPointerDown={(event) => {
						if (event.button !== 0 || item.disabled) return
						if (item.value !== value) onChange(item.value)
					}}
					render={<button type="button" />}
					value={item.value}
					{...styles.item()}
				>
					{item.label}
				</Radio.Root>
			))}
		</RadioGroup>
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

namespace styles {
	// TDS SegmentedControl's treatment at toolbar density.
	export const root = style({
		backgroundColor: 'container.regular',
		borderRadius: '2xs',
		display: 'flex',
		maxWidth: '100% !custom',
		overflow: 'hidden',
		padding: '2',
	})

	export const item = style({
		alignItems: 'center',
		backgroundColor: 'transparent !custom',
		border: 'none !custom',
		borderRadius: '3xs',
		color: 'content.secondary',
		cursor: 'pointer',
		display: 'flex',
		flex: '1 !custom',
		height: '24',
		justifyContent: 'center',
		paddingInline: '8',
		typography: 'body.b3',
		whiteSpace: 'nowrap',
		'@media (hover: hover)': { ':hover': { color: 'content.primary' } },
		selectors: {
			'&[data-checked]': {
				backgroundColor: 'background.secondary',
				color: 'content.primary',
			},
			'&:focus-visible': {
				outline: '2px solid currentColor !custom',
				outlineOffset: '-2px !custom',
			},
			'&[data-disabled]': { cursor: 'default', opacity: 0.5 },
		},
	})
}
