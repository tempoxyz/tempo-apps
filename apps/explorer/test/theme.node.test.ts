import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	getInitialThemeMode,
	getStoredThemeMode,
	getSystemThemeMode,
	themeBootScript,
	themeMediaQuery,
} from '#lib/theme'

afterEach(() => {
	vi.unstubAllGlobals()
})

function stubBrowser(options: {
	datasetTheme?: string
	storedTheme?: string | null
	systemPrefersLight?: boolean
}): void {
	const {
		datasetTheme,
		storedTheme = null,
		systemPrefersLight = false,
	} = options

	vi.stubGlobal('document', {
		documentElement: {
			dataset: { theme: datasetTheme },
			style: {},
		},
	})
	vi.stubGlobal('window', {
		localStorage: {
			getItem: () => storedTheme,
		},
		matchMedia: (query: string) => ({
			matches: query === themeMediaQuery && systemPrefersLight,
		}),
	})
}

describe('theme detection', () => {
	it('uses the system color scheme when no theme is saved', () => {
		stubBrowser({ systemPrefersLight: true })

		expect(getStoredThemeMode()).toBeUndefined()
		expect(getSystemThemeMode()).toBe('light')
		expect(getInitialThemeMode()).toBe('light')
	})

	it('prefers a saved theme over the system color scheme', () => {
		stubBrowser({ storedTheme: 'dark', systemPrefersLight: true })

		expect(getStoredThemeMode()).toBe('dark')
		expect(getInitialThemeMode()).toBe('dark')
	})

	it('applies system detection in the boot script', () => {
		stubBrowser({ systemPrefersLight: true })

		Function(themeBootScript)()

		expect(document.documentElement.dataset.theme).toBe('light')
		expect(document.documentElement.style.colorScheme).toBe('light')
	})
})
