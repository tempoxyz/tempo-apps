/**
 * The control strip above a data panel.
 *
 * Shared by the trace tree and the state diff so the two read as siblings.
 * Left side is a summary of what is below. Right side is the view controls,
 * heaviest last: mode toggle at the end, where it also sits in the calldata
 * field, so "same value, different representation" always looks the same.
 */

import {
	IconButton as TdsIconButton,
	Tooltip,
	style,
} from '@tempoxyz/ds/platform'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Choices } from '#comps/ui/Choices'
import { pressDown, transitionColors, truncate } from '#styles/explorer'

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
	 * stays `tertiary`. The local style only adds hover and motion, which
	 * IconButton leaves unset.
	 */
	export function IconButton(props: {
		onClick: () => void
		label: string
		active?: boolean | undefined
		children: React.ReactElement
	}): React.JSX.Element {
		return (
			<Tooltip content={props.label}>
				<TdsIconButton
					aria-label={props.label}
					onClick={props.onClick}
					scale="small"
					variant={props.active ? 'secondary' : 'tertiary'}
					{...cx(styles.iconButton(), pressDown(), transitionColors())}
				>
					{props.children}
				</TdsIconButton>
			</Tooltip>
		)
	}
}

namespace styles {
	export const toolbar = style({
		alignItems: 'center',
		borderBottomWidth: 'regular',
		borderColor: 'line.secondary',
		borderStyle: 'solid',
		display: 'flex',
		flexWrap: 'wrap',
		gap: '8',
		paddingBlock: '8',
		paddingInline: '12',
	})

	export const summary = style({
		color: 'content.secondary',
		marginRight: 'auto !custom',
		minWidth: '0 !custom',
		typography: 'body.b3',
	})

	export const iconButton = style({
		flexShrink: 0,
		'@media (hover: hover)': {
			':hover': { backgroundColor: 'container.strong' },
		},
	})
}
