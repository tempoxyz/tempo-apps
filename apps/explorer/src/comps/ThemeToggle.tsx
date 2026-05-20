import type * as React from 'react'
import { cx } from '#lib/css'
import { type ThemePreference, useTheme } from '#lib/theme'
import MonitorIcon from '~icons/lucide/monitor'
import MoonIcon from '~icons/lucide/moon'
import SunIcon from '~icons/lucide/sun'

const ORDER: ReadonlyArray<ThemePreference> = ['system', 'light', 'dark']

const ICONS: Record<ThemePreference, typeof SunIcon> = {
	system: MonitorIcon,
	light: SunIcon,
	dark: MoonIcon,
}

const LABELS: Record<ThemePreference, string> = {
	system: 'System',
	light: 'Light',
	dark: 'Dark',
}

const SEGMENT_SIZE = 24

export function ThemeToggle(props: ThemeToggle.Props): React.JSX.Element {
	const { className } = props
	const { preference, setPreference } = useTheme()
	const activeIndex = ORDER.indexOf(preference)

	return (
		<div
			className={cx(
				'relative inline-flex items-center rounded-full border border-distinct bg-base-plane p-[2px]',
				className,
			)}
			style={{ height: SEGMENT_SIZE + 4 }}
		>
			<span
				aria-hidden
				className="absolute top-[2px] left-[2px] rounded-full bg-base-alt shadow-[0_1px_0_color-mix(in_oklch,var(--color-base-content)_6%,transparent)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
				style={{
					width: SEGMENT_SIZE,
					height: SEGMENT_SIZE,
					transform: `translateX(${activeIndex * SEGMENT_SIZE}px)`,
				}}
			/>
			{ORDER.map((option) => {
				const Icon = ICONS[option]
				const isActive = option === preference
				return (
					<button
						key={option}
						type="button"
						aria-pressed={isActive}
						aria-label={`Theme: ${LABELS[option].toLowerCase()}`}
						title={LABELS[option]}
						onClick={() => setPreference(option)}
						className={cx(
							'relative inline-flex items-center justify-center transition-colors outline-none focus-visible:text-accent',
							isActive ? 'text-primary' : 'text-tertiary hover:text-secondary',
						)}
						style={{ width: SEGMENT_SIZE, height: SEGMENT_SIZE }}
					>
						<Icon className="size-[14px]" />
					</button>
				)
			})}
		</div>
	)
}

export declare namespace ThemeToggle {
	type Props = {
		className?: string | undefined
	}
}
