import { Accordion, CopyButton, ListGroup, style } from '@tempoxyz/ds'
import type * as React from 'react'
import type { AbiParameter } from 'viem'

/**
 * A decoded ABI value, including unnamed tuples. Plain values are `ListGroup`
 * rows beside a copy button; tuples and arrays are `Accordion` items whose
 * panels hold their members the same way.
 */
export function AbiArgument(props: AbiArgument.Props): React.JSX.Element {
	return <ArgumentList items={[props]} />
}

export declare namespace AbiArgument {
	type Props = {
		input: AbiParameter
		value: unknown
	}
}

/** Runs of plain values share one `ListGroup`; each tuple or array gets an accordion. */
function ArgumentList(props: {
	items: AbiArgument.Props[]
}): React.JSX.Element {
	const groups: Array<{ composite: boolean; items: AbiArgument.Props[] }> = []
	for (const item of props.items) {
		const composite = getChildren(item.input, item.value) !== undefined
		const last = groups.at(-1)
		if (last && !last.composite && !composite) last.items.push(item)
		else groups.push({ composite, items: [item] })
	}
	return (
		<>
			{groups.map((group, index) =>
				group.composite ? (
					<Composite
						key={`${index}-${group.items[0]?.input.name}`}
						{...(group.items[0] as AbiArgument.Props)}
					/>
				) : (
					<ListGroup.Root key={`${index}-${group.items[0]?.input.name}`}>
						{group.items.map((item, itemIndex) => (
							<Leaf key={`${itemIndex}-${item.input.name}`} {...item} />
						))}
					</ListGroup.Root>
				),
			)}
		</>
	)
}

function Leaf(props: AbiArgument.Props): React.JSX.Element {
	const { input, value } = props
	const name = input.name || '(unnamed)'
	return (
		<ListGroup.Row>
			<ListGroup.Info>
				<ListGroup.Title>
					<span {...styles.mono()}>{name}</span>
				</ListGroup.Title>
				<ListGroup.Description>
					<span {...styles.mono()}>{input.type}</span>
				</ListGroup.Description>
			</ListGroup.Info>
			<span {...styles.value()}>{String(value)}</span>
			<CopyButton aria-label={`Copy ${name}`} value={String(value)} />
		</ListGroup.Row>
	)
}

function Composite(props: AbiArgument.Props): React.JSX.Element {
	const { input, value } = props
	const name = input.name || '(unnamed)'
	const array = /\[\d*\]$/.test(input.type)
	const children = getChildren(input, value) ?? []
	return (
		// Tuples open by default; arrays, which can be long, start closed.
		<Accordion.Root defaultValue={input.type === 'tuple' ? ['value'] : []}>
			<Accordion.Item value="value">
				<Accordion.Trigger>
					<span {...styles.trigger()}>
						<span {...styles.mono()}>{name}</span>
						<span {...styles.secondary()}>
							<span {...styles.mono()}>{input.type}</span>
							{` · ${children.length} ${array ? 'items' : 'fields'}`}
						</span>
					</span>
				</Accordion.Trigger>
				{/* Closed panels stay in the markup, so the page can render them on the server. */}
				<Accordion.Panel keepMounted>
					{children.length ? (
						<ArgumentList items={children} />
					) : (
						<span {...styles.secondary()}>
							Empty {array ? 'array' : 'tuple'}
						</span>
					)}
				</Accordion.Panel>
			</Accordion.Item>
		</Accordion.Root>
	)
}

/** Child values of an array or tuple, or `undefined` for a single value. */
function getChildren(
	input: AbiParameter,
	value: unknown,
): AbiArgument.Props[] | undefined {
	const itemType = /^(.*)\[\d*\]$/.exec(input.type)?.[1]
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
	export const mono = style({ typography: 'mono.m1' })

	export const secondary = style({ color: 'content.secondary' })

	export const trigger = style({
		alignItems: 'baseline',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		minWidth: '0',
	})

	// The value takes twice the label's share of the row and scrolls when tall.
	export const value = style({
		color: 'content.primary',
		flexBasis: '0',
		flexGrow: 2,
		maxHeight: '160',
		minWidth: '0',
		overflow: 'auto',
		overflowWrap: 'anywhere',
		typography: 'mono.m1',
	})
}
