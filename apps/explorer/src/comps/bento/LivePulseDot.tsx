import type * as React from 'react'
import { cx } from '#lib/css'

/**
 * Tiny animated green dot used inline next to tile labels to signal
 * that the displayed value is a live (continuously updating) metric.
 * Uses the `liveDot` keyframe defined in routes/styles.css.
 */
export function LivePulseDot(
	props: { className?: string } = {},
): React.JSX.Element {
	return (
		<span
			aria-hidden
			className={cx(
				'inline-block size-[6px] rounded-full bg-positive',
				props.className,
			)}
			style={{ animation: 'liveDot 1.6s ease-out infinite' }}
		/>
	)
}
