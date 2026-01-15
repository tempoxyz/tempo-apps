import { useEffect, useState } from 'react'
import { cx } from '#cva.config'

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
			className={cx('h-[1px] bg-inverse pointer-events-none', className)}
			style={{
				width: `${progress}%`,
				opacity: progress >= 99 ? 0 : 1,
				transition: progress >= 99 ? 'width 0.1s ease-out' : 'width 0.1s ease',
			}}
		/>
	)
}
