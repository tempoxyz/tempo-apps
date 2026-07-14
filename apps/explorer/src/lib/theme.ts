export type ThemeMode = 'dark' | 'light'

export const defaultThemeMode = 'dark' satisfies ThemeMode
export const themeStorageKey = 'tempo-explorer-theme'

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

export function getInitialThemeMode(): ThemeMode {
	if (typeof document === 'undefined') return defaultThemeMode

	const datasetTheme = document.documentElement.dataset.theme
	if (isThemeMode(datasetTheme)) return datasetTheme

	try {
		const storedTheme = window.localStorage.getItem(themeStorageKey)
		if (isThemeMode(storedTheme)) return storedTheme
	} catch {
		// Keep the default theme when storage is unavailable.
	}

	return defaultThemeMode
}

export function persistThemeMode(mode: ThemeMode): void {
	applyThemeMode(mode)

	try {
		window.localStorage.setItem(themeStorageKey, mode)
	} catch {
		// Theme still applies for the current tab even if persistence fails.
	}
}

export const themeBootScript = `(function(){try{var key='${themeStorageKey}';var stored=window.localStorage.getItem(key);var theme=stored==='light'||stored==='dark'?stored:'${defaultThemeMode}';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){document.documentElement.dataset.theme='${defaultThemeMode}';document.documentElement.style.colorScheme='${defaultThemeMode}';}})();`
