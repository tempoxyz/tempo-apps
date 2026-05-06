import type * as React from 'react'
import { cx } from '#lib/css'

export type StatusSegment = {
	status: 'healthy' | 'slow' | 'stalled'
	label?: string
}

const SEGMENT_CLASS: Record<StatusSegment['status'], string> = {
	healthy: 'bg-positive/75',
	slow: 'bg-warning/80',
	stalled: 'bg-negative/70',
}

/**
 * Status-page style thin bars. Each segment is a fixed-width colored stripe
 * with a native tooltip; hovering any segment in the row slightly brightens
 * all of them to suggest the row is one continuous indicator.
 */
export function StatusBar(props: StatusBar.Props): React.JSX.Element {
	const { segments, className, ariaLabel } = props
	return (
		<div
			className={cx(
				'group/statusbar flex h-full w-full items-stretch gap-[2px]',
				className,
			)}
			role="img"
			aria-label={ariaLabel ?? 'status bar'}
		>
			{segments.map((segment, i) => (
				<span
					key={i}
					title={segment.label}
					className={cx(
						'flex-1 max-w-[4px] rounded-[1.5px] opacity-70 transition-opacity',
						'group-hover/statusbar:opacity-90 hover:opacity-100!',
						SEGMENT_CLASS[segment.status],
					)}
				/>
			))}
		</div>
	)
}

export declare namespace StatusBar {
	type Props = {
		segments: StatusSegment[]
		className?: string
		ariaLabel?: string
	}
}
