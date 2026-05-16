import type * as React from 'react'
import { cx } from '#lib/css'
import { type ThemePreference, useTheme } from '#lib/theme'
import MonitorIcon from '~icons/lucide/monitor'
import MoonIcon from '~icons/lucide/moon'
import SunIcon from '~icons/lucide/sun'

const NEXT: Record<ThemePreference, ThemePreference> = {
	system: 'light',
	light: 'dark',
	dark: 'system',
}

const ICONS: Record<ThemePreference, typeof SunIcon> = {
	system: MonitorIcon,
	light: SunIcon,
	dark: MoonIcon,
}

const LABELS: Record<ThemePreference, string> = {
	system: 'Theme: follow system',
	light: 'Theme: light',
	dark: 'Theme: dark',
}

export function ThemeToggle(props: ThemeToggle.Props): React.JSX.Element {
	const { className } = props
	const { preference, setPreference } = useTheme()
	const next = NEXT[preference]
	const Icon = ICONS[preference]
	const label = `${LABELS[preference]} (click for ${LABELS[next].toLowerCase().replace('theme: ', '')})`

	return (
		<button
			type="button"
			onClick={() => setPreference(next)}
			aria-label={label}
			title={label}
			className={cx(
				'inline-flex items-center justify-center size-[28px] rounded-[8px] text-secondary hover:text-primary press-down transition-colors outline-none focus-visible:text-accent',
				className,
			)}
		>
			<Icon className="size-[16px]" />
		</button>
	)
}

export declare namespace ThemeToggle {
	type Props = {
		className?: string | undefined
	}
}
