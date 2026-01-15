import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { tempoDevnet, tempoLocalnet, tempoModerato } from 'viem/chains'
import { tempoPresto } from './lib/chains'
import {
	cookieStorage,
	cookieToInitialState,
	createConfig,
	createStorage,
	fallback,
	http,
	serialize,
	webSocket,
} from 'wagmi'
import { KeyManager, webAuthn } from 'wagmi/tempo'

// Helper to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

// Properly serialize a WebAuthn credential for transmission
function serializeCredential(credential: PublicKeyCredential) {
	const response = credential.response as AuthenticatorAttestationResponse
	return {
		id: credential.id,
		rawId: arrayBufferToBase64(credential.rawId),
		type: credential.type,
		authenticatorAttachment: (credential as any).authenticatorAttachment,
		response: {
			attestationObject: arrayBufferToBase64(response.attestationObject),
			clientDataJSON: arrayBufferToBase64(response.clientDataJSON),
			...(response.getAuthenticatorData
				? {
						authenticatorData: arrayBufferToBase64(
							response.getAuthenticatorData(),
						),
					}
				: {}),
		},
	}
}

// Determine the key-manager URL at runtime (when methods are called, not at config time)
// This avoids SSR/client hydration mismatches
function getKeyManagerBaseUrl() {
	if (typeof window !== 'undefined') {
		const hostname = window.location.hostname
		if (hostname === 'localhost' || hostname.endsWith('.workers.dev')) {
			return 'https://key-manager.porto.workers.dev/keys'
		}
	}
	// Production or SSR fallback
	return TEMPO_ENV === 'presto'
		? 'https://keys.tempo.xyz/keys'
		: 'https://key-manager-mainnet.porto.workers.dev/keys'
}

function getKeyManager() {
	// Create a lazy key manager that determines the URL at method call time
	// This ensures SSR and client use the same config structure
	return {
		async getChallenge() {
			const baseUrl = getKeyManagerBaseUrl()
			const response = await fetch(`${baseUrl}/challenge`)
			if (!response.ok)
				throw new Error(`Failed to get challenge: ${response.statusText}`)
			return (await response.json()) as {
				challenge: `0x${string}`
				rp?: { id: string; name: string }
			}
		},
		async getPublicKey(parameters: { credential: { id: string } }) {
			const baseUrl = getKeyManagerBaseUrl()
			const response = await fetch(`${baseUrl}/${parameters.credential.id}`)
			if (!response.ok)
				throw new Error(`Failed to get public key: ${response.statusText}`)
			const data = (await response.json()) as { publicKey: `0x${string}` }
			return data.publicKey
		},
		async setPublicKey(parameters: {
			credential: PublicKeyCredential
			publicKey: `0x${string}`
		}) {
			const baseUrl = getKeyManagerBaseUrl()
			const serializedCredential = serializeCredential(parameters.credential)
			const response = await fetch(`${baseUrl}/${parameters.credential.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					credential: serializedCredential,
					publicKey: parameters.publicKey,
				}),
			})
			if (!response.ok) {
				const error = await response.text()
				throw new Error(`Failed to set public key: ${error}`)
			}
		},
	} as ReturnType<typeof KeyManager.http>
}

const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV

export type WagmiConfig = ReturnType<typeof getWagmiConfig>

export const getTempoChain = createIsomorphicFn()
	.client(() =>
		TEMPO_ENV === 'presto'
			? tempoPresto
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: tempoModerato,
	)
	.server(() =>
		TEMPO_ENV === 'presto'
			? tempoPresto
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: tempoModerato,
	)

const getRpcUrls = createIsomorphicFn()
	.client(() => {
		const chain = getTempoChain()
		return chain.rpcUrls.default
	})
	.server(() => {
		const chain = getTempoChain()
		const isPresto = TEMPO_ENV === 'presto'
		// Presto uses HTTP Basic Auth (not path-based key), so don't append key to URL
		if (isPresto) {
			return chain.rpcUrls.default
		}
		return {
			webSocket: chain.rpcUrls.default.webSocket.map(
				(url: string) => `${url}/${process.env.TEMPO_RPC_KEY}`,
			),
			http: chain.rpcUrls.default.http.map(
				(url: string) => `${url}/${process.env.TEMPO_RPC_KEY}`,
			),
		}
	})

function getTempoTransport() {
	const rpcUrls = getRpcUrls()

	return fallback([
		...rpcUrls.http.map((url: string) => http(url, { batch: true })),
		...rpcUrls.webSocket.map(webSocket),
	])
}

export function getWagmiConfig() {
	const chain = getTempoChain()
	const transport = getTempoTransport()

	return createConfig({
		ssr: true,
		batch: { multicall: false },
		chains: [chain, tempoLocalnet],
		connectors: [
			// rpId is determined dynamically: the key-manager's challenge response
			// may include an rp.id which takes precedence, otherwise the browser
			// uses the current origin's effective domain
			webAuthn({
				keyManager: getKeyManager(),
			}),
		],
		multiInjectedProviderDiscovery: false,
		storage: createStorage({ storage: cookieStorage }),
		transports: {
			[chain.id]: transport,
			[tempoLocalnet.id]: http(undefined, { batch: true }),
		} as never,
	})
}

export const getWagmiStateSSR = createServerFn().handler(() => {
	const cookie = getRequestHeader('cookie')
	const initialState = cookieToInitialState(getWagmiConfig(), cookie)
	return serialize(initialState || {})
})

declare module 'wagmi' {
	interface Register {
		config: ReturnType<typeof getWagmiConfig>
	}
}
