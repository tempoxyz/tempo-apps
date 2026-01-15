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
import { type KeyManager, webAuthn } from 'wagmi/tempo'

const TEMPO_ENV = import.meta.env.VITE_TEMPO_ENV

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
		// Local dev or workers.dev preview
		if (hostname === 'localhost' || hostname.endsWith('.workers.dev')) {
			return 'https://key-manager.porto.workers.dev/keys'
		}
		// Production presto/mainnet domains
		if (hostname.includes('presto') || hostname.includes('mainnet')) {
			return 'https://keys.tempo.xyz/keys'
		}
	}
	// SSR fallback based on env
	return TEMPO_ENV === 'presto'
		? 'https://keys.tempo.xyz/keys'
		: 'https://key-manager-mainnet.porto.workers.dev/keys'
}

function fetchWithTimeout(
	url: string,
	options: RequestInit = {},
	timeoutMs = 10000,
) {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), timeoutMs)
	return fetch(url, { ...options, signal: controller.signal }).finally(() =>
		clearTimeout(timeout),
	)
}

function getKeyManager() {
	// Create a lazy key manager that determines the URL at method call time
	// This ensures SSR and client use the same config structure
	return {
		async getChallenge() {
			console.log('[KM] getChallenge')
			const baseUrl = getKeyManagerBaseUrl()
			const response = await fetchWithTimeout(`${baseUrl}/challenge`)
			if (!response.ok)
				throw new Error(`Failed to get challenge: ${response.statusText}`)
			const result = (await response.json()) as {
				challenge: `0x${string}`
				rp?: { id: string; name: string }
			}
			console.log('[KM] getChallenge =>', result)
			return result
		},
		async getPublicKey(parameters: { credential: { id: string } }) {
			console.log('[KM] getPublicKey', parameters.credential.id)
			const baseUrl = getKeyManagerBaseUrl()
			const response = await fetchWithTimeout(
				`${baseUrl}/${parameters.credential.id}`,
			)
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error(
						'This passkey is not registered. It may have been created on a different domain or environment. Please sign up to create a new passkey.',
					)
				}
				throw new Error(`Failed to get public key: ${response.statusText}`)
			}
			const data = (await response.json()) as { publicKey: `0x${string}` }
			console.log('[KM] getPublicKey =>', `${data.publicKey?.slice(0, 20)}...`)
			return data.publicKey
		},
		async setPublicKey(parameters: {
			credential: PublicKeyCredential
			publicKey: `0x${string}`
		}) {
			console.log(
				'[KM] setPublicKey',
				parameters.credential.id,
				`${parameters.publicKey.slice(0, 20)}...`,
			)
			const baseUrl = getKeyManagerBaseUrl()
			const serializedCredential = serializeCredential(parameters.credential)
			const response = await fetchWithTimeout(
				`${baseUrl}/${parameters.credential.id}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						credential: serializedCredential,
						publicKey: parameters.publicKey,
					}),
				},
			)
			if (!response.ok) {
				const error = await response.text()
				console.error('[KM] setPublicKey err', error)
				throw new Error(`Failed to set public key: ${error}`)
			}
			console.log('[KM] setPublicKey ok')
		},
	} as ReturnType<typeof KeyManager.http>
}

export type WagmiConfig = ReturnType<typeof getWagmiConfig>

export const getTempoChain = createIsomorphicFn()
	.client(() =>
		TEMPO_ENV === 'moderato'
			? tempoModerato
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: tempoPresto,
	)
	.server(() =>
		TEMPO_ENV === 'moderato'
			? tempoModerato
			: TEMPO_ENV === 'devnet'
				? tempoDevnet
				: tempoPresto,
	)

const getRpcUrls = createIsomorphicFn()
	.client(() => {
		const chain = getTempoChain()
		return chain.rpcUrls.default
	})
	.server(() => {
		const chain = getTempoChain()
		const isModerato = TEMPO_ENV === 'moderato'
		// Moderato uses path-based key, mainnet (presto) uses HTTP Basic Auth
		if (isModerato) {
			return {
				webSocket: chain.rpcUrls.default.webSocket.map(
					(url: string) => `${url}/${process.env.TEMPO_RPC_KEY}`,
				),
				http: chain.rpcUrls.default.http.map(
					(url: string) => `${url}/${process.env.TEMPO_RPC_KEY}`,
				),
			}
		}
		return chain.rpcUrls.default
	})

function getTempoTransport() {
	const rpcUrls = getRpcUrls()

	// Log only tx-related RPC calls
	const debugHttp = (url: string) => {
		const base = http(url, { batch: true })
		return (cfg: Parameters<typeof base>[0]) => {
			const t = base(cfg)
			return {
				...t,
				async request(args: { method: string; params?: unknown[] }) {
					if (args.method.includes('send') || args.method.includes('sign')) {
						console.log(
							'[RPC]',
							args.method,
							`${args.params?.[0]?.slice?.(0, 40)}...`,
						)
					}
					try {
						const res = await t.request(args)
						if (args.method.includes('send') || args.method.includes('sign')) {
							console.log(
								'[RPC]',
								args.method,
								'ok',
								typeof res === 'string' ? `${res.slice(0, 20)}...` : res,
							)
						}
						return res
					} catch (e: unknown) {
						if (args.method.includes('send') || args.method.includes('sign')) {
							console.error('[RPC]', args.method, 'err', (e as Error).message)
						}
						throw e
					}
				},
			}
		}
	}

	return fallback([
		...rpcUrls.http.map((url: string) => debugHttp(url)),
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
