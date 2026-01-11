import * as React from 'react'

export enum AppMode {
	Explorer = 'explorer',
	Faucet = 'faucet',
}

const AppContext = React.createContext<AppMode>(AppMode.Explorer)

export function useAppMode() {
	return React.useContext(AppContext)
}

export function AppModeProvider({
	children,
	mode,
}: {
	children: React.ReactNode
	mode: AppMode
}) {
	return <AppContext.Provider value={mode}>{children}</AppContext.Provider>
}

/**
 * Detects the app mode based on the current hostname
 */
export function detectAppMode(): AppMode {
	if (typeof window === 'undefined') {
		// Server-side: check env or default to explorer
		return AppMode.Explorer
	}

	const hostname = window.location.hostname
	if (hostname.startsWith('faucet.') || hostname.includes('faucet')) {
		return AppMode.Faucet
	}
	return AppMode.Explorer
}
