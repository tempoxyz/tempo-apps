import * as React from 'react'

interface LottoNumberProps {
	value: string
	duration?: number
	className?: string
}

export function LottoNumber({
	value,
	duration = 1000,
	className,
}: LottoNumberProps) {
	// Skip animation for zero values
	const isZeroValue = /^\$?0(\.0+)?$/.test(value)
	const [chars, setChars] = React.useState<
		{ char: string; settled: boolean }[]
	>(value.split('').map((char) => ({ char, settled: isZeroValue })))
	const prevValueRef = React.useRef(value)
	const isInitialMount = React.useRef(true)

	React.useEffect(() => {
		// Skip animation for zero values
		if (isZeroValue) {
			setChars(value.split('').map((char) => ({ char, settled: true })))
			prevValueRef.current = value
			isInitialMount.current = false
			return
		}

		const prevValue = prevValueRef.current
		prevValueRef.current = value

		// On initial mount, show immediately without animation
		// On updates, only animate characters that changed
		const changedIndices = new Set<number>()
		if (isInitialMount.current) {
			// Skip animation on initial mount - show value immediately
			setChars(value.split('').map((char) => ({ char, settled: true })))
			isInitialMount.current = false
			return
		} else {
			// Find which characters actually changed
			const maxLen = Math.max(value.length, prevValue.length)
			for (let i = 0; i < maxLen; i++) {
				if (value[i] !== prevValue[i]) {
					changedIndices.add(i)
				}
			}
		}

		// If nothing changed, just update state without animation
		if (changedIndices.size === 0) {
			setChars(value.split('').map((char) => ({ char, settled: true })))
			return
		}

		const startTime = Date.now()

		const animate = () => {
			const now = Date.now()
			const progress = Math.min((now - startTime) / duration, 1)

			const newChars = value.split('').map((char, i) => {
				// If this character didn't change, keep it settled
				if (!changedIndices.has(i)) {
					return { char, settled: true }
				}

				// Gradually settle from left to right (only for changed chars)
				const settlePoint = progress * 1.3 - i * 0.08
				const isSettled = settlePoint >= 1

				// Keep non-numeric characters as-is but still animate opacity
				if (!/\d/.test(char)) {
					return { char, settled: isSettled }
				}

				if (isSettled) {
					return { char, settled: true }
				}

				// Random digit while not settled
				return {
					char: Math.floor(Math.random() * 10).toString(),
					settled: false,
				}
			})

			setChars(newChars)

			if (progress < 1) {
				requestAnimationFrame(animate)
			}
		}

		requestAnimationFrame(animate)
	}, [value, duration, isZeroValue])

	// Find decimal position from the value prop (stable reference)
	const decimalIndex = value.indexOf('.')

	return (
		<span className={className}>
			{chars.map((c, i) => {
				// Only apply reduced opacity to digits after the decimal point (when settled)
				const isDecimalPart =
					decimalIndex !== -1 && i > decimalIndex && /\d/.test(c.char)

				return (
					<span
						key={i}
						style={{
							opacity: isDecimalPart ? 0.35 : 1,
							transition: 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
						}}
					>
						{c.char}
					</span>
				)
			})}
		</span>
	)
}
