import type * as React from 'react'
import { useTheme } from '#lib/theme'
import Sun from '~icons/lucide/sun'
import Moon from '~icons/lucide/moon'

export function ThemeToggle(): React.JSX.Element {
	const { theme, setTheme } = useTheme()
	const nextTheme = theme === 'dark' ? 'light' : 'dark'
	const Icon = theme === 'dark' ? Moon : Sun

	return (
		<button
			type="button"
			onClick={() => setTheme(nextTheme)}
			className="flex items-center justify-center size-[28px] text-secondary hover:text-primary transition-colors press-down cursor-pointer"
			title={`Theme: ${theme}`}
			aria-label={`Current theme: ${theme}. Click to change.`}
		>
			<Icon className="size-[16px]" />
		</button>
	)
}
