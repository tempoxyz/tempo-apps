/**
 * The control strip above a data panel.
 *
 * Shared by the trace tree and the state diff so the two read as siblings.
 * Before this, passing `label={null}` (which the simulator does, because the tab
 * already names the panel) left a 40px strip holding nothing but a bare
 * `(decoded)` link and two unlabelled icons — the same empty band in two places,
 * styled slightly differently in each.
 *
 * Left side is a summary of what is below. Right side is the view controls,
 * heaviest last: mode toggle at the end, where it also sits in the calldata
 * field, so "same value, different representation" always looks the same.
 */

import { IconButton as TdsIconButton, style } from '@tempoxyz/ds/platform'
import type * as React from 'react'
import { cx } from 'zyzz'
import { Choices } from '#comps/ui/Choices'
import { pressDown, transitionColors, truncate } from '#styles/explorer'

/**
 * One control, N mutually exclusive states — the pane split, Decoded/Raw in a
 * panel toolbar, Decoded/Hex in the calldata field. One implementation so
 * "same value, different representation" always looks the same.
 */
export function SegmentedControl<T extends string>(
	props: SegmentedControl.Props<T>,
): React.JSX.Element {
	const { value, options, onChange } = props
	// Both sizes use the compact TDS scale: the old `md` was already the 24px
	// compact control, and TDS has no smaller step for `sm`.
	return (
		<Choices
			label={options.map((option) => option.label).join(' / ')}
			value={value}
			onChange={onChange}
			scale="small"
			items={options.map((option) => ({
				value: option.value,
				label: <span title={option.title}>{option.label}</span>,
			}))}
		/>
	)
}

export declare namespace SegmentedControl {
	interface Props<T extends string> {
		value: T
		options: ReadonlyArray<{ value: T; label: string; title?: string }>
		onChange: (value: T) => void
		size?: 'sm' | 'md'
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
	 * TDS IconButton owns size, fill, radius, and focus ring. A toggle that is
	 * on gets the filled `secondary` variant; everything else stays `tertiary`.
	 * The local style only adds hover and motion, which IconButton leaves unset.
	 */
	export function IconButton(props: {
		onClick: () => void
		title: string
		active?: boolean | undefined
		children: React.ReactElement
	}): React.JSX.Element {
		return (
			<TdsIconButton
				aria-label={props.title}
				onClick={props.onClick}
				title={props.title}
				scale="small"
				variant={props.active ? 'secondary' : 'tertiary'}
				{...cx(styles.iconButton(), pressDown(), transitionColors())}
			>
				{props.children}
			</TdsIconButton>
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
		paddingBlock: '4',
		paddingInline: '12',
	})

	export const summary = style({
		color: 'content.tertiary',
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
