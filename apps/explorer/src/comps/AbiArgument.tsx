import { CopyButton, Rows, style } from '@tempoxyz/ds'
import * as React from 'react'
import type { AbiParameter } from 'viem'

/**
 * A decoded ABI value as TDS `Rows`, including unnamed tuples. Tuples and
 * arrays expand into nested rows; other values sit beside a copy button.
 */
export function AbiArgument(props: AbiArgument.Props): React.JSX.Element {
	return (
		<Rows.Root dividers="full" size="small">
			<ArgumentRow {...props} />
		</Rows.Root>
	)
}

export declare namespace AbiArgument {
	type Props = {
		input: AbiParameter
		value: unknown
	}
}

function ArgumentRow(props: AbiArgument.Props): React.JSX.Element {
	const { input, value } = props
	const name = input.name || '(unnamed)'
	const array = /^(.*)\[\d*\]$/.exec(input.type)
	const children = getChildren(input, value, array?.[1])
	// Tuples open by default; arrays, which can be long, start closed.
	const [open, setOpen] = React.useState(input.type === 'tuple')
	const panelId = React.useId()

	const info = (
		<Rows.Info>
			<Rows.Title>
				<span {...styles.mono()}>{name}</span>
			</Rows.Title>
			<Rows.Description>
				<span {...styles.mono()}>{input.type}</span>
				{children && ` · ${children.length} ${array ? 'items' : 'fields'}`}
			</Rows.Description>
		</Rows.Info>
	)

	if (!children)
		return (
			<Rows.Row>
				{info}
				<span {...styles.value()}>{String(value)}</span>
				<CopyButton aria-label={`Copy ${name}`} value={String(value)} />
			</Rows.Row>
		)

	return (
		<>
			<Rows.Row
				action="expand"
				aria-controls={panelId}
				aria-expanded={open}
				onClick={() => setOpen(!open)}
			>
				{info}
			</Rows.Row>
			{/* Closed panels stay in the markup, so the page can render them on the server. */}
			<Rows.Panel hidden={!open} id={panelId}>
				{children.length ? (
					<Rows.Root dividers="full" size="small">
						{children.map((child, index) => (
							<ArgumentRow key={`${index}-${child.input.name}`} {...child} />
						))}
					</Rows.Root>
				) : (
					`Empty ${array ? 'array' : 'tuple'}`
				)}
			</Rows.Panel>
		</>
	)
}

/** Child values of an array or tuple, or `undefined` for a single value. */
function getChildren(
	input: AbiParameter,
	value: unknown,
	itemType: string | undefined,
): AbiArgument.Props[] | undefined {
	if (itemType !== undefined && Array.isArray(value))
		return value.map((item, index) => ({
			input: { ...input, type: itemType, name: `[${index}]` } as AbiParameter,
			value: item,
		}))
	if (input.type === 'tuple' && 'components' in input && value != null)
		return input.components.map((component, index) => ({
			input: { ...component, name: component.name || `[${index}]` },
			value: Array.isArray(value)
				? value[index]
				: (value as Record<string, unknown>)[component.name ?? ''],
		}))
	return undefined
}

namespace styles {
	export const mono = style({ typography: 'copy.13.mono' })

	// The value takes twice the label's share of the row and scrolls when tall.
	export const value = style({
		color: 'foreground',
		flexBasis: '0',
		flexGrow: 2,
		maxHeight: '160',
		minWidth: '0',
		overflow: 'auto',
		overflowWrap: 'anywhere',
		typography: 'copy.13.mono',
	})
}
