import * as React from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'tempo-explorer:theme'

export function readThemePreference(): ThemePreference {
	if (typeof localStorage === 'undefined') return 'system'
	const raw = localStorage.getItem(THEME_STORAGE_KEY)
	if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
	return 'system'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
	if (preference === 'light' || preference === 'dark') return preference
	if (typeof window === 'undefined') return 'dark'
	return window.matchMedia?.('(prefers-color-scheme: light)').matches
		? 'light'
		: 'dark'
}

export function applyTheme(preference: ThemePreference): void {
	if (typeof document === 'undefined') return
	const resolved = resolveTheme(preference)
	if (preference === 'system') {
		document.documentElement.removeAttribute('data-theme')
	} else {
		document.documentElement.setAttribute('data-theme', resolved)
	}
	document.documentElement.style.colorScheme = resolved
}

/**
 * Inline script injected into `<head>` before hydration to avoid FOUC.
 * Reads the stored preference and applies the resolved theme synchronously.
 */
export const themeBootstrapScript = `(function(){try{var k='${THEME_STORAGE_KEY}';var p=localStorage.getItem(k);if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var r=p==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;if(p!=='system')document.documentElement.setAttribute('data-theme',r);document.documentElement.style.colorScheme=r;}catch(e){}})();`

export function useTheme(): {
	preference: ThemePreference
	resolved: ResolvedTheme
	setPreference: (p: ThemePreference) => void
} {
	const [preference, setPreferenceState] =
		React.useState<ThemePreference>('system')
	const [resolved, setResolved] = React.useState<ResolvedTheme>('dark')

	React.useEffect(() => {
		const initial = readThemePreference()
		setPreferenceState(initial)
		setResolved(resolveTheme(initial))
	}, [])

	React.useEffect(() => {
		if (preference !== 'system') return
		const mql = window.matchMedia('(prefers-color-scheme: light)')
		const handler = (event: MediaQueryListEvent) => {
			const next: ResolvedTheme = event.matches ? 'light' : 'dark'
			setResolved(next)
			document.documentElement.style.colorScheme = next
		}
		mql.addEventListener('change', handler)
		return () => mql.removeEventListener('change', handler)
	}, [preference])

	const setPreference = React.useCallback((p: ThemePreference) => {
		try {
			localStorage.setItem(THEME_STORAGE_KEY, p)
		} catch {
			// ignore persistence errors (private mode, quota, etc.)
		}
		setPreferenceState(p)
		setResolved(resolveTheme(p))
		applyTheme(p)
	}, [])

	return { preference, resolved, setPreference }
}
