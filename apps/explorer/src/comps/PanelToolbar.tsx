/**
 * The control strip above a data panel.
 *
 * Shared by the trace tree and the state diff so the two read as siblings.
 * Left side is a summary of what is below. Right side is the view controls,
 * with the format toggle last.
 */

import { Button, ChoiceGroup, style, Tooltip } from '@tempoxyz/ds'
import type * as React from 'react'
import { cx } from 'zyzz'
import { truncate } from '#styles/explorer'

/**
 * A small `ChoiceGroup` for a panel's format, such as Decoded or Raw.
 */
export function ViewToggle<T extends string>(
	props: ViewToggle.Props<T>,
): React.JSX.Element {
	return (
		<ChoiceGroup.Root<T>
			aria-label={props.label}
			onValueChange={props.onChange}
			size="small"
			value={props.value}
		>
			{props.options.map((option) => (
				<ChoiceGroup.Item key={option.value} value={option.value}>
					{option.label}
				</ChoiceGroup.Item>
			))}
		</ChoiceGroup.Root>
	)
}

export declare namespace ViewToggle {
	interface Props<T extends string> {
		/** Accessible name for the group. */
		label: string
		value: T
		options: ReadonlyArray<{ value: T; label: string }>
		onChange: (value: T) => void
	}
}

export function PanelToolbar(props: PanelToolbar.Props): React.JSX.Element {
	return (
		<Tooltip.Provider>
			<div {...styles.toolbar()}>
				{props.summary && (
					<span {...cx(styles.summary(), truncate())}>{props.summary}</span>
				)}
				{props.children}
			</div>
		</Tooltip.Provider>
	)
}

export declare namespace PanelToolbar {
	interface Props {
		/** What is below, in words. Pushes the controls to the right. */
		summary?: React.ReactNode
		children: React.ReactNode
	}
}

export namespace PanelToolbar {
	/**
	 * An icon button with its label in a tooltip. A toggle that is on takes the
	 * `secondary` variant; everything else stays `text`.
	 */
	export function IconButton(props: {
		onClick: () => void
		label: string
		active?: boolean | undefined
		children: React.ReactElement
	}): React.JSX.Element {
		return (
			<Tooltip.Root>
				<Tooltip.Trigger
					render={
						<Button
							aria-label={props.label}
							onClick={props.onClick}
							shape="icon"
							size="small"
							variant={props.active ? 'secondary' : 'text'}
							{...styles.iconButton()}
						/>
					}
				>
					{props.children}
				</Tooltip.Trigger>
				<Tooltip.Popup>{props.label}</Tooltip.Popup>
			</Tooltip.Root>
		)
	}
}

namespace styles {
	export const toolbar = style({
		alignItems: 'center',
		borderBottomWidth: '1',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '16',
	})

	export const summary = style({
		color: 'gray.900',
		marginRight: 'auto !custom',
		minWidth: '0 !custom',
		typography: 'label.13',
	})

	export const iconButton = style({ flexShrink: 0 })
}
