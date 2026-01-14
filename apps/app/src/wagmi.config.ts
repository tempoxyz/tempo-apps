import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { tempoDevnet, tempoLocalnet, tempoModerato } from 'viem/chains'
import { tempoPresto } from './lib/chains'
import { custom } from 'viem'
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

const isLocalhost =
	typeof window !== 'undefined' && window.location.hostname === 'localhost'

const isWorkersDevPreview =
	typeof window !== 'undefined' &&
	window.location.hostname.endsWith('.workers.dev')

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

function getKeyManager() {
	const baseUrl =
		isLocalhost || isWorkersDevPreview
			? 'https://key-manager.porto.workers.dev/keys'
			: TEMPO_ENV === 'presto'
				? 'https://keys.tempo.xyz/keys'
				: 'https://key-manager-mainnet.porto.workers.dev/keys'

	const httpKeyManager = KeyManager.http(baseUrl)

	// Override setPublicKey to properly serialize the credential
	return {
		...httpKeyManager,
		async setPublicKey(parameters: {
			credential: {
				id: string
				rawId: ArrayBuffer
				type: string
				response: {
					attestationObject: ArrayBuffer
					clientDataJSON: ArrayBuffer
					getAuthenticatorData?: () => ArrayBuffer
				}
			}
			publicKey: `0x${string}`
		}) {
			const serializedCredential = serializeCredential(
				parameters.credential as unknown as PublicKeyCredential,
			)
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
	} as unknown as ReturnType<typeof KeyManager.http>
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

const getPrestoAuth = createIsomorphicFn()
	.client(() => undefined)
	.server(() => {
		const auth = process.env.PRESTO_RPC_AUTH
		if (!auth) return undefined
		return `Basic ${Buffer.from(auth).toString('base64')}`
	})

function getTempoTransport() {
	const rpcUrls = getRpcUrls()
	const isPresto = TEMPO_ENV === 'presto'

	// Presto: no WebSocket, use HTTP Basic Auth via custom transport
	if (isPresto) {
		const auth = getPrestoAuth()
		const rpcUrl = rpcUrls.http[0]
		return custom({
			async request({ method, params }) {
				const response = await fetch(rpcUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(auth ? { Authorization: auth } : {}),
					},
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
				})
				const data = (await response.json()) as {
					result?: unknown
					error?: { message: string }
				}
				if (data.error) throw new Error(data.error.message)
				return data.result
			},
		})
	}

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
			webAuthn({
				keyManager: getKeyManager(),
				// For localhost/workers.dev preview, override rpId to match origin
				...(() => {
					if (typeof window === 'undefined') return {}
					const hostname = window.location.hostname
					if (hostname === 'localhost') {
						return {
							rpId: 'localhost',
							createOptions: { rpId: 'localhost' },
							getOptions: { rpId: 'localhost' },
						}
					}
					if (hostname.endsWith('.workers.dev')) {
						// Use the full hostname as rpId for workers.dev previews
						return {
							rpId: hostname,
							createOptions: { rpId: hostname },
							getOptions: { rpId: hostname },
						}
					}
					return {}
				})(),
			} as Parameters<typeof webAuthn>[0]),
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
