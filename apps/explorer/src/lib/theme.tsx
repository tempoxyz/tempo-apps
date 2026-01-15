import * as React from 'react'

export type Theme = 'system' | 'light' | 'dark'

interface ThemeContextValue {
	theme: Theme
	setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function ThemeProvider(props: { children: React.ReactNode }) {
	const [theme, setTheme] = React.useState<Theme>('system')

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
