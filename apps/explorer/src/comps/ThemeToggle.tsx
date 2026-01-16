import * as React from 'react'
import { useTheme, type Theme } from '#lib/theme'
import Sun from '~icons/lucide/sun'
import Moon from '~icons/lucide/moon'

export function ThemeToggle() {
	const { theme, setTheme } = useTheme()
	const [systemPrefersDark, setSystemPrefersDark] = React.useState(false)

	React.useEffect(() => {
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
		setSystemPrefersDark(mediaQuery.matches)

		const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
		mediaQuery.addEventListener('change', handler)
		return () => mediaQuery.removeEventListener('change', handler)
	}, [])

	const nextTheme: Record<Theme, Theme> = {
		system: 'light',
		light: 'dark',
		dark: 'system',
	}

	const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark)
	const Icon = isDark ? Moon : Sun

	return (
		<button
			type="button"
			onClick={() => setTheme(nextTheme[theme])}
			className="flex items-center justify-center size-[28px] text-secondary hover:text-primary transition-colors press-down"
			title={`Theme: ${theme}`}
			aria-label={`Current theme: ${theme}. Click to change.`}
		>
			<Icon className="size-[16px]" />
		</button>
	)
}
