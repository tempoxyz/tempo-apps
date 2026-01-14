import * as React from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'tempo-theme'

function getSystemTheme(): 'light' | 'dark' {
	if (typeof window === 'undefined') return 'light'
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light'
}

function applyTheme(theme: Theme) {
	const resolved = theme === 'system' ? getSystemTheme() : theme
	document.documentElement.classList.toggle(
		'scheme-light!',
		resolved === 'light',
	)
	document.documentElement.classList.toggle('scheme-dark!', resolved === 'dark')
}

export function useTheme() {
	const [theme, setThemeState] = React.useState<Theme>('system')
	const [mounted, setMounted] = React.useState(false)

	React.useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
		if (stored && ['light', 'dark', 'system'].includes(stored)) {
			setThemeState(stored)
			applyTheme(stored)
		}
		setMounted(true)
	}, [])

	React.useEffect(() => {
		if (!mounted) return

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
		const handleChange = () => {
			if (theme === 'system') applyTheme('system')
		}
		mediaQuery.addEventListener('change', handleChange)
		return () => mediaQuery.removeEventListener('change', handleChange)
	}, [theme, mounted])

	const setTheme = React.useCallback((newTheme: Theme) => {
		setThemeState(newTheme)
		localStorage.setItem(STORAGE_KEY, newTheme)
		applyTheme(newTheme)
	}, [])

	const resolvedTheme = theme === 'system' ? getSystemTheme() : theme

	return { theme, setTheme, resolvedTheme, mounted }
}
