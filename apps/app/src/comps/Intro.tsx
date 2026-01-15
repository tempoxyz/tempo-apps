import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ShaderCard } from './ShaderCard'
import { useActivitySummary, type ActivityType } from '#lib/activity-context'
import GlobeIcon from '~icons/lucide/globe'
import BookOpenIcon from '~icons/lucide/book-open'

function TempoWordmark() {
	return (
		<svg
			aria-label="Tempo"
			viewBox="0 0 830 185"
			className="h-3.5 sm:h-4 w-auto"
			role="img"
		>
			<path d="M61.5297 181.489H12.6398L57.9524 43.1662H0L12.6398 2.62335H174.096L161.456 43.1662H106.604L61.5297 181.489Z" fill="currentColor" />
			<path d="M243.464 181.489H127.559L185.75 2.62335H301.178L290.207 36.727H223.192L211.029 75.1235H275.898L264.928 108.75H199.821L187.658 147.385H254.196L243.464 181.489Z" fill="currentColor" />
			<path d="M295.923 181.489H257.05L315.479 2.62335H380.348L378.202 99.2107L441.401 2.62335H512.47L454.279 181.489H405.628L444.262 61.2912H443.547L364.131 181.489H335.274L336.466 59.8603H335.989L295.923 181.489Z" fill="currentColor" />
			<path d="M567.193 35.7731L548.353 93.487H553.6C565.524 93.487 575.461 90.7046 583.411 85.1399C591.36 79.4162 596.527 71.3077 598.912 60.8142C600.979 51.7517 599.866 45.3126 595.573 41.4968C591.281 37.681 584.126 35.7731 574.109 35.7731H567.193ZM519.973 181.489H471.083L529.274 2.62335H588.657C602.331 2.62335 614.096 4.84923 623.953 9.30099C633.97 13.5938 641.283 19.7944 645.894 27.903C650.664 35.8526 652.254 45.1536 650.664 55.806C648.597 69.7973 643.191 82.1191 634.447 92.7715C625.702 103.424 614.334 111.692 600.343 117.574C586.511 123.298 571.009 126.16 553.838 126.16H537.859L519.973 181.489Z" fill="currentColor" />
			<path d="M767.195 170.041C750.977 179.581 733.727 184.351 715.443 184.351H714.966C698.749 184.351 685.076 180.773 673.946 173.619C662.976 166.305 655.106 156.448 650.336 144.046C645.725 131.645 644.612 118.051 646.997 103.265C650.018 84.6629 656.934 67.4919 667.745 51.7517C678.557 36.0116 692.071 23.4512 708.288 14.0707C724.505 4.69025 741.836 0 760.279 0H760.755C777.609 0 791.52 3.57731 802.491 10.7319C813.62 17.8865 821.331 27.6645 825.624 40.0658C830.076 52.3082 831.03 66.061 828.486 81.3241C825.465 99.2902 818.549 116.223 807.737 132.122C796.926 147.862 783.412 160.502 767.195 170.041ZM699.703 139.277C703.995 147.385 711.468 151.439 722.121 151.439H722.597C731.342 151.439 739.451 148.18 746.923 141.661C754.555 134.984 760.994 126.08 766.241 114.951C771.646 103.821 775.621 91.4201 778.165 77.7468C780.55 64.3915 779.596 53.6596 775.303 45.551C771.01 37.2835 763.617 33.1497 753.124 33.1497H752.647C744.538 33.1497 736.668 36.4885 729.037 43.1662C721.564 49.8438 715.045 58.8268 709.481 70.1152C703.916 81.4036 699.862 93.646 697.318 106.842C694.774 120.198 695.569 131.009 699.703 139.277Z" fill="currentColor" />
		</svg>
	)
}

// Activity colors as RGB (0-1 range) for the shader
const activityColorsRGB: Record<ActivityType, [number, number, number]> = {
	send: [0.231, 0.510, 0.965], // #3b82f6
	received: [0.133, 0.773, 0.369], // #22c55e
	swap: [0.545, 0.361, 0.965], // #8b5cf6
	mint: [0.976, 0.451, 0.086], // #f97316
	burn: [0.937, 0.267, 0.267], // #ef4444
	approve: [0.024, 0.714, 0.831], // #06b6d4
	unknown: [0.420, 0.451, 0.498], // #6b7280
}

function useAmbientColors() {
	const { summary } = useActivitySummary()

	const hasActivity = summary && summary.types.length > 0

	const colors = React.useMemo((): Array<[number, number, number]> => {
		if (!hasActivity || !summary.typeCounts) return []
		const totalCount = Object.values(summary.typeCounts).reduce(
			(a, b) => (a as number) + (b as number),
			0,
		) as number
		if (totalCount === 0) return []

		const proportionalColors: Array<[number, number, number]> = []
		for (const type of summary.types) {
			const count = summary.typeCounts[type] ?? 0
			const proportion = count / totalCount
			const repetitions = Math.max(1, Math.round(proportion * 5))
			for (let i = 0; i < repetitions; i++) {
				proportionalColors.push(activityColorsRGB[type])
			}
		}

		if (proportionalColors.length === 1) {
			return [proportionalColors[0], proportionalColors[0], proportionalColors[0]]
		}
		return proportionalColors
	}, [hasActivity, summary?.types, summary?.typeCounts])

	const intensity = React.useMemo(() => {
		if (!summary) return 0
		const count = summary.count
		if (count >= 10) return 1
		if (count >= 5) return 0.7
		if (count >= 2) return 0.5
		return 0.3
	}, [summary])

	return { colors, intensity }
}

export function Intro() {
	const { t } = useTranslation()
	const { colors, intensity } = useAmbientColors()

	return (
		<div className="relative flex min-h-full flex-col items-start justify-end px-7 sm:px-8 py-7 max-md:min-h-[120px] max-md:py-4 max-md:px-5">
			<ShaderCard
				className="max-md:hidden pointer-events-none"
				ambientColors={colors}
				ambientIntensity={intensity}
			/>
			<div className="relative flex flex-col items-start gap-y-2 z-10 max-md:gap-y-1.5">
				<TempoWordmark />
				<p className="text-[15px] sm:text-[17px] leading-[22px] sm:leading-[24px] text-secondary max-md:text-[13px] max-md:leading-[18px] max-w-[280px] sm:max-w-none">
					{t('intro.tagline')}
				</p>
				<div className="flex gap-1.5 flex-wrap isolate">
					<a
						className="flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium text-white/90 bg-white/10 border border-white/15 rounded-full hover:text-white hover:border-white/30 hover:bg-white/15 transition-all"
						href="https://tempo.xyz"
						rel="noreferrer"
						target="_blank"
					>
						<GlobeIcon className="size-[12px]" />
						{t('intro.website')}
					</a>
					<a
						className="flex items-center gap-1 px-2 py-0.5 text-[12px] font-medium text-white/90 bg-white/10 border border-white/15 rounded-full hover:text-white hover:border-white/30 hover:bg-white/15 transition-all"
						href="https://docs.tempo.xyz"
						rel="noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="size-[12px]" />
						{t('intro.docs')}
					</a>
				</div>
			</div>
		</div>
	)
}
