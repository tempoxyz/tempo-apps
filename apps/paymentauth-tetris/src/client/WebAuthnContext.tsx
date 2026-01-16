import { createContext, useContext, type ReactNode } from 'react'
import { useWebAuthn } from './useWebAuthn'

type WebAuthnContextType = ReturnType<typeof useWebAuthn>

const WebAuthnContext = createContext<WebAuthnContextType | null>(null)

export function WebAuthnProvider({ children }: { children: ReactNode }) {
	const webauthn = useWebAuthn()
	return (
		<WebAuthnContext.Provider value={webauthn}>
			{children}
		</WebAuthnContext.Provider>
	)
}

export function useWebAuthnContext() {
	const context = useContext(WebAuthnContext)
	if (!context) {
		throw new Error('useWebAuthnContext must be used within a WebAuthnProvider')
	}
	return context
}
