import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { variants } from '@tempoxyz/ds/platform'
import type * as React from 'react'
import type { Props as StyleProps } from 'zyzz'

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
		scale,
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
			{...styles.root({ className, scale, style: inlineStyle })}
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
					{...styles.item({ scale })}
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
	> &
		Pick<StyleProps.Variants<typeof styles.root>, 'scale'> & {
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
	export const root = variants({
		base: {
			backgroundColor: 'container.regular',
			boxSizing: 'border-box',
			display: 'flex',
			maxWidth: '100% !custom',
			overflow: 'hidden',
		},
		defaultVariants: { scale: 'medium' },
		variants: {
			scale: {
				medium: { borderRadius: 'xs', padding: '4' },
				small: { borderRadius: '2xs', padding: '2' },
			},
		},
	})

	export const item = variants({
		base: {
			alignItems: 'center',
			backgroundColor: 'transparent !custom',
			border: 'none !custom',
			boxSizing: 'border-box',
			color: 'content.secondary',
			cursor: 'pointer',
			display: 'flex',
			flex: '1 !custom',
			justifyContent: 'center',
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
		},
		defaultVariants: { scale: 'medium' },
		variants: {
			scale: {
				medium: {
					borderRadius: '2xs',
					height: '32px !custom',
					paddingInline: '12',
					typography: 'body.b3',
				},
				small: {
					borderRadius: '6px !custom',
					height: '24px !custom',
					paddingInline: '8',
					typography: 'body.b3',
				},
			},
		},
	})
}
