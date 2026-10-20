/**
 * The control strip above a data panel.
 *
 * Shared by the trace tree and the state diff so the two read as siblings.
 * Left side is a summary of what is below. Right side is the view controls,
 * heaviest last: mode toggle at the end, where it also sits in the calldata
 * field, so "same value, different representation" always looks the same.
 */

import { Button, Tooltip, style } from '@tempoxyz/ds'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Choices } from '#comps/ui/Choices'
import { truncate } from '#styles/explorer'

/**
 * One control, N mutually exclusive states — Decoded/Raw in a panel toolbar,
 * Decoded/Hex in the calldata field, Latest/Pinned block. One implementation
 * so "same value, different representation" always looks the same.
 */
export function ViewToggle<T extends string>(
	props: ViewToggle.Props<T>,
): React.JSX.Element {
	return (
		<Choices
			label={props.label}
			value={props.value}
			onChange={props.onChange}
			items={props.options}
		/>
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
		<div {...styles.toolbar()}>
			{props.summary && (
				<span {...cx(styles.summary(), truncate())}>{props.summary}</span>
			)}
			{props.children}
		</div>
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
	 * A toggle that is on gets the filled `secondary` variant; everything else
	 * stays `text`. TDS Button owns hover, press, and motion; the local style
	 * only keeps it from shrinking in the wrapping toolbar.
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
		borderBottomWidth: '1px',
		borderColor: 'grayAlpha.200',
		borderStyle: 'solid',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '2',
		paddingBlock: '2',
		paddingInline: '3',
	})

	export const summary = style({
		color: 'gray.900',
		marginRight: 'auto !custom',
		minWidth: '0 !custom',
		typography: 'label.12',
	})

	export const iconButton = style({ flexShrink: 0 })
}
