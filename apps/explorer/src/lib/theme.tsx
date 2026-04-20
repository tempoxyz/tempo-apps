import * as React from 'react'

export type Theme = 'light' | 'dark'

interface ThemeContextValue {
	theme: Theme
	setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function ThemeProvider(props: { children: React.ReactNode }) {
	const [theme, setThemeState] = React.useState<Theme>('light')
	const hasManualPreference = React.useRef(false)
	const setTheme = React.useCallback((nextTheme: Theme) => {
		hasManualPreference.current = true
		setThemeState(nextTheme)
	}, [])

	React.useEffect(() => {
		if (typeof window === 'undefined') return
		const readStoredTheme = (): Theme | undefined => {
			try {
				const stored = window.localStorage.getItem('theme')
				if (stored === 'light' || stored === 'dark') {
					return stored
				}
			} catch {
				return undefined
			}
			return undefined
		}

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
		const storedTheme = readStoredTheme()
		const applyTheme = (matches: boolean) => {
			setThemeState(matches ? 'dark' : 'light')
		}

		if (storedTheme) {
			hasManualPreference.current = true
			setThemeState(storedTheme)
		} else {
			applyTheme(mediaQuery.matches)
		}
		const handler = (event: MediaQueryListEvent) => {
			if (hasManualPreference.current) return
			applyTheme(event.matches)
		}
		mediaQuery.addEventListener('change', handler)
		return () => mediaQuery.removeEventListener('change', handler)
	}, [])

	React.useEffect(() => {
		if (typeof window === 'undefined') return
		if (!hasManualPreference.current) return
		try {
			window.localStorage.setItem('theme', theme)
		} catch {
			// Ignore storage errors.
		}
	}, [theme])

	React.useEffect(() => {
		const root = document.documentElement
		root.classList.remove('scheme-light!', 'scheme-dark!')

		if (theme === 'light') {
			root.classList.add('scheme-light!')
		} else if (theme === 'dark') {
			root.classList.add('scheme-dark!')
		}
	}, [theme])

	return (
		<ThemeContext.Provider value={{ theme, setTheme }}>
			{props.children}
		</ThemeContext.Provider>
	)
}

export function useTheme() {
	const context = React.useContext(ThemeContext)
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider')
	}
	return context
}
