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
	const [chars, setChars] = React.useState<
		{ char: string; settled: boolean }[]
	>(value.split('').map((char) => ({ char, settled: false })))
	const prevValueRef = React.useRef(value)

	React.useEffect(() => {
		prevValueRef.current = value
		const startTime = Date.now()

		const animate = () => {
			const now = Date.now()
			const progress = Math.min((now - startTime) / duration, 1)

			const newChars = value.split('').map((char, i) => {
				// Gradually settle from left to right
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
	}, [value, duration])

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
