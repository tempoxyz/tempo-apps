import { style } from '@tempoxyz/ds/platform'
import type { AbiParameter } from 'viem'
import { cx } from 'zyzz'
import { useCopy } from '#lib/hooks'
import { pressDown, transitionColors } from '#styles/explorer'

/** Render decoded ABI values using their structure, including unnamed tuples. */
export function AbiArgument(props: AbiArgument.Props): React.JSX.Element {
	const { input, value } = props
	const { copy } = useCopy()
	const name = input.name || '(unnamed)'
	const array = /^(.*)\[\d*\]$/.exec(input.type)
	const children =
		array && Array.isArray(value)
			? value.map((item, index) => ({
					input: {
						...input,
						type: array[1],
						name: `[${index}]`,
					} as AbiParameter,
					value: item,
				}))
			: input.type === 'tuple' && 'components' in input && value != null
				? input.components.map((component, index) => ({
						input: { ...component, name: component.name || `[${index}]` },
						value: Array.isArray(value)
							? value[index]
							: (value as Record<string, unknown>)[component.name ?? ''],
					}))
				: undefined

	if (children)
		return (
			<details open={input.type === 'tuple'} {...styles.details()}>
				<summary {...styles.summary()}>
					<span>{name}</span>
					<span {...styles.meta()}>{input.type}</span>
					<span {...styles.meta()}>
						{children.length} {array ? 'items' : 'fields'}
					</span>
				</summary>
				{children.length ? (
					<div {...styles.children()}>
						{children.map((child, index) => (
							<AbiArgument key={`${index}-${child.input.name}`} {...child} />
						))}
					</div>
				) : (
					<div {...styles.empty()}>Empty {array ? 'array' : 'tuple'}</div>
				)}
			</details>
		)

	return (
		<button
			type="button"
			onClick={() => copy(String(value))}
			title={`Copy ${name}`}
			{...cx(styles.value(), pressDown(), transitionColors())}
		>
			<span {...styles.label()}>
				<span {...styles.labelName()}>{name}</span>
				<span {...styles.labelType()}>{input.type}</span>
			</span>
			<span {...styles.valueText()}>{String(value)}</span>
		</button>
	)
}

export declare namespace AbiArgument {
	type Props = {
		input: AbiParameter
		value: unknown
	}
}

namespace styles {
	export const details = style({
		minWidth: '0 !custom',
		typography: 'mono.inline',
	})

	export const summary = style({
		color: 'content.primary',
		cursor: 'pointer',
		paddingBlock: '12',
		paddingInline: '12',
		wordBreak: 'break-all',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
	})

	export const meta = style({ color: 'content.secondary', marginLeft: '8' })

	export const children = style({
		borderColor: 'line.secondary',
		borderLeftWidth: 'regular',
		marginBottom: '8',
		marginLeft: '16',
		paddingLeft: '8',
		selectors: {
			'& > :not(:last-child)': {
				borderBottomWidth: 'regular',
				borderColor: 'line.secondary',
			},
		},
	})

	export const empty = style({
		color: 'content.secondary',
		paddingBottom: '12',
		paddingInline: '24',
	})

	export const value = style({
		color: 'content.primary',
		cursor: 'pointer',
		display: 'grid',
		gap: '4',
		gridTemplateColumns: 'minmax(0, 1fr)',
		paddingBlock: '8',
		paddingInline: '12',
		textAlign: 'left',
		typography: 'mono.inline',
		width: '100% !custom',
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.regular' },
		},
		'@media (width >= 640px)': {
			gap: '12',
			gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
		},
	})

	export const label = style({ minWidth: '0 !custom', wordBreak: 'break-all' })

	export const labelName = style({ color: 'content.primary', display: 'block' })

	export const labelType = style({
		color: 'content.secondary',
		display: 'block',
	})

	export const valueText = style({
		color: 'content.primary',
		maxHeight: '160px !custom',
		minWidth: '0 !custom',
		overflow: 'auto',
		wordBreak: 'break-all',
	})
}
