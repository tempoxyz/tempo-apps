export type ThemeMode = 'dark' | 'light'

export const defaultThemeMode = 'dark' satisfies ThemeMode
export const themeStorageKey = 'tempo-explorer-theme'
export const themeMediaQuery = '(prefers-color-scheme: light)'

export function isThemeMode(
	value: string | null | undefined,
): value is ThemeMode {
	return value === 'dark' || value === 'light'
}

export function applyThemeMode(mode: ThemeMode): void {
	if (typeof document === 'undefined') return

	document.documentElement.dataset.theme = mode
	document.documentElement.style.colorScheme = mode
}

export function getSystemThemeMode(): ThemeMode {
	if (
		typeof window === 'undefined' ||
		typeof window.matchMedia !== 'function'
	) {
		return defaultThemeMode
	}

	return window.matchMedia(themeMediaQuery).matches ? 'light' : 'dark'
}

export function getStoredThemeMode(): ThemeMode | undefined {
	if (typeof window === 'undefined') return undefined

	try {
		const storedTheme = window.localStorage.getItem(themeStorageKey)
		return isThemeMode(storedTheme) ? storedTheme : undefined
	} catch {
		return undefined
	}
}

export function getInitialThemeMode(): ThemeMode {
	if (typeof document === 'undefined') return defaultThemeMode

	const datasetTheme = document.documentElement.dataset.theme
	if (isThemeMode(datasetTheme)) return datasetTheme

	return getStoredThemeMode() ?? getSystemThemeMode()
}

export function persistThemeMode(mode: ThemeMode): void {
	applyThemeMode(mode)

	try {
		window.localStorage.setItem(themeStorageKey, mode)
	} catch {
		// Theme still applies for the current tab even if persistence fails.
	}
}

export const themeBootScript = `(function(){var stored;try{stored=window.localStorage.getItem('${themeStorageKey}');}catch(e){}var theme=stored==='light'||stored==='dark'?stored:typeof window.matchMedia==='function'&&window.matchMedia('${themeMediaQuery}').matches?'light':'${defaultThemeMode}';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;})();`
