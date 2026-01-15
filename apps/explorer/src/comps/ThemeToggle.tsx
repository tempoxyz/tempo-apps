import { useTheme, type Theme } from '#lib/theme'
import Sun from '~icons/lucide/sun'
import Moon from '~icons/lucide/moon'
import Monitor from '~icons/lucide/monitor'

export function ThemeToggle() {
	const { theme, setTheme } = useTheme()

	const nextTheme: Record<Theme, Theme> = {
		system: 'light',
		light: 'dark',
		dark: 'system',
	}

	const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

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
