import { style } from '@tempoxyz/ds/platform'
import { useEffect, useState } from 'react'

interface ProgressLineProps {
	loading: boolean
	start?: number
	interval?: number
	className?: string
}

export function ProgressLine({
	loading,
	start = 0,
	interval = 300,
	className,
}: ProgressLineProps) {
	const endDelay = 200

	const [show, setShow] = useState(false)
	const [progress, setProgress] = useState(0)

	// Start delay
	useEffect(() => {
		if (!loading) return
		if (start === 0) {
			setShow(true)
			return
		}
		const delayTimer = setTimeout(() => setShow(true), start)
		return () => clearTimeout(delayTimer)
	}, [loading, start])

	// Progress interval
	useEffect(() => {
		if (!show || !loading) return

		setProgress(0)
		const progressTimer = setInterval(() => {
			setProgress((prev) => {
				if (prev >= 90) return prev
				return prev + Math.random() * 10
			})
		}, interval)

		return () => clearInterval(progressTimer)
	}, [show, loading, interval])

	// Finish progress
	useEffect(() => {
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

namespace styles {
	export const line = style({
		backgroundColor: 'component.button.primary.fill',
		height: '1px !custom',
		pointerEvents: 'none',
	})
}
