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

import type * as React from 'react'
import { cx } from '#lib/css'

/**
 * One control, N mutually exclusive states — the pane split, Decoded/Raw in a
 * panel toolbar, Decoded/Hex in the calldata field. One implementation so
 * "same value, different representation" always looks the same.
 */
export function SegmentedControl<T extends string>(
	props: SegmentedControl.Props<T>,
): React.JSX.Element {
	const { value, options, onChange, size = 'md' } = props
	return (
		<div
			className="flex shrink-0 items-center rounded-[7px] border border-card-border bg-card-header p-[2px]"
			role="tablist"
		>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					role="tab"
					aria-selected={value === option.value}
					onClick={() => onChange(option.value)}
					title={option.title}
					className={cx(
						'cursor-pointer rounded-[5px] press-down transition-colors',
						size === 'sm'
							? 'px-[7px] py-[2px] text-[11px]'
							: 'px-[10px] py-[3px] text-[12px]',
						value === option.value
							? 'bg-base-plane text-primary shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
							: 'text-tertiary hover:text-secondary',
					)}
				>
					{option.label}
				</button>
			))}
		</div>
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
		<div className="flex flex-wrap items-center gap-[6px] border-b border-dashed border-distinct px-[12px] py-[7px]">
			{props.summary && (
				<span className="mr-auto min-w-0 truncate text-[11px] text-tertiary">
					{props.summary}
				</span>
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
	export function IconButton(props: {
		onClick: () => void
		title: string
		active?: boolean | undefined
		children: React.ReactNode
	}): React.JSX.Element {
		return (
			<button
				type="button"
				onClick={props.onClick}
				title={props.title}
				className={cx(
					'flex size-[24px] shrink-0 items-center justify-center rounded-[6px] border border-card-border cursor-pointer press-down transition-colors',
					props.active ? 'text-primary' : 'text-tertiary hover:text-primary',
				)}
			>
				{props.children}
			</button>
		)
	}
}
