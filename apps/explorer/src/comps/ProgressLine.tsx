import { style } from '@tempoxyz/ds/platform'
import * as React from 'react'

const endDelay = 200
const tickInterval = 300

export function ProgressLine(
	props: ProgressLine.Props,
): React.JSX.Element | null {
	const { loading, start = 0, className } = props

	const [show, setShow] = React.useState(false)
	const [progress, setProgress] = React.useState(0)

	// Start delay
	React.useEffect(() => {
		if (!loading) return
		if (start === 0) {
			setShow(true)
			return
		}
		const delayTimer = setTimeout(() => setShow(true), start)
		return () => clearTimeout(delayTimer)
	}, [loading, start])

	// Progress interval
	React.useEffect(() => {
		if (!show || !loading) return

		setProgress(0)
		const progressTimer = setInterval(() => {
			setProgress((prev) => {
				if (prev >= 90) return prev
				return prev + Math.random() * 10
			})
		}, tickInterval)

		return () => clearInterval(progressTimer)
	}, [show, loading])

	// Finish progress
	React.useEffect(() => {
		if (loading) return

		setProgress(99)
		const hideTimer = setTimeout(() => {
			setShow(false)
			setProgress(0)
		}, endDelay)
		return () => clearTimeout(hideTimer)
	}, [loading])

	if (!show) return null
	return (
		<div
			{...styles.line({
				className,
				style: {
					width: `${progress}%`,
					opacity: progress >= 99 ? 0 : 1,
					transition:
						progress >= 99 ? 'width 0.1s ease-out' : 'width 0.1s ease',
				},
			})}
		/>
	)
}

export declare namespace ProgressLine {
	type Props = {
		loading: boolean
		/** Delay in milliseconds before the line appears. */
		start?: number | undefined
		className?: string | undefined
	}
}

namespace styles {
	export const line = style({
		backgroundColor: 'content.primary',
		height: '1px !custom',
		pointerEvents: 'none',
	})
}
