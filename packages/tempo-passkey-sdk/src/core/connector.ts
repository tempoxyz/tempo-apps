import { KeyManager, webAuthn } from 'tempo.ts/wagmi'
import { createConnector } from 'wagmi'

// Define the shape of the config we WANT to pass
interface ExtendedWebAuthnConfig {
	keyManager: ReturnType<typeof KeyManager.localStorage>
	authenticatorSelection: {
		residentKey: 'required' | 'preferred' | 'discouraged'
		requireResidentKey: boolean
		userVerification: 'required' | 'preferred' | 'discouraged'
	}
}

/**
 * TempoPasskeyConnector
 * A high-level Wagmi connector that simplifies Passkey (WebAuthn)
 * and Account Abstraction (AA) integration on Tempo.
 */
export function tempoPasskeyConnector(options: {
	keyManager?: ReturnType<typeof KeyManager.localStorage>
}) {
	// 1. Setup default KeyManager (localStorage) if not provided
	const keyManager = options.keyManager || KeyManager.localStorage()

	// 2. Prepare config with Resident Key support
	const webAuthnConfig: ExtendedWebAuthnConfig = {
		keyManager,
		authenticatorSelection: {
			residentKey: 'required',
			requireResidentKey: true,
			userVerification: 'required',
		},
	}

	// 3. Return a factory function that Wagmi expects
	// We cast to unknown first to escape the strict type checking of the external library,
	// then cast to the expected Parameter type. This avoids 'any' and satisfies Biome/TS.
	return createConnector((config) => ({
		...webAuthn(webAuthnConfig as unknown as Parameters<typeof webAuthn>[0])(
			config,
		),

		id: 'tempo-passkey',
		name: 'Tempo Passkey',
		type: 'passkey',
	}))
}
