import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { style } from '@tempoxyz/ds'
import type * as React from 'react'

/**
 * Compact segmented radio group in the Tempo Design System style, for small
 * toolbars. TDS's own SegmentedControl has no compact size.
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
		backgroundColor: 'grayAlpha.100',
		borderRadius: 'lg',
		display: 'flex',
		maxWidth: '100% !custom',
		overflow: 'hidden',
		padding: '2px !custom',
	})

	export const item = style({
		alignItems: 'center',
		backgroundColor: 'transparent !custom',
		border: 'none !custom',
		borderRadius: 'sm',
		color: 'gray.900',
		cursor: 'pointer',
		display: 'flex',
		flex: '1 !custom',
		height: '6',
		justifyContent: 'center',
		paddingInline: '2',
		typography: 'label.12',
		whiteSpace: 'nowrap',
		'@media (hover: hover)': { ':hover': { color: 'foreground' } },
		selectors: {
			'&[data-checked]': {
				backgroundColor: 'background.surface',
				color: 'foreground',
			},
			'&:focus-visible': {
				outline: '2px solid currentColor !custom',
				outlineOffset: '-2px !custom',
			},
			'&[data-disabled]': { cursor: 'default', opacity: 0.5 },
		},
	})
}
