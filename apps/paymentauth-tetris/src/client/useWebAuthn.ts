import { useState, useCallback, useEffect } from 'react'
import * as WebAuthnP256 from 'ox/WebAuthnP256'
import * as PublicKey from 'ox/PublicKey'
import type { Address, Hex as HexType } from 'viem'
import { createPublicClient, createClient, http } from 'viem'
import {
	prepareTransactionRequest,
	signTransaction as viemSignTransaction,
} from 'viem/actions'
import { tempoModerato } from 'viem/chains'
import { Abis, Account as TempoAccount } from 'viem/tempo'

const ALPHA_USD = '0x20c0000000000000000000000000000000000001' as const

// Storage keys
const CREDENTIAL_STORAGE_KEY = 'tetris_webauthn_credential'

interface StoredCredential {
	id: string
	publicKey: HexType // Public key as hex string
	address: Address
}

export function useWebAuthn() {
	const [address, setAddress] = useState<Address | null>(null)
	const [isConnected, setIsConnected] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [storedCredential, setStoredCredential] =
		useState<StoredCredential | null>(null)

	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http('https://rpc.moderato.tempo.xyz'),
	})

	// Load stored credential on mount
	useEffect(() => {
		const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY)
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as StoredCredential
				setStoredCredential(parsed)
				setAddress(parsed.address)
				setIsConnected(true)
			} catch {
				localStorage.removeItem(CREDENTIAL_STORAGE_KEY)
			}
		}
	}, [])

	// Sign up - create new passkey
	const signUp = useCallback(async () => {
		setIsLoading(true)
		setError(null)

		try {
			// Create WebAuthn credential
			const cred = await WebAuthnP256.createCredential({
				name: 'Tempo Tetris',
			})

			// Serialize public key to hex
			const publicKeyHex = PublicKey.toHex(cred.publicKey)

			// Create a Tempo account from the WebAuthn credential to get the address
			const account = TempoAccount.fromWebAuthnP256({
				id: cred.id,
				publicKey: publicKeyHex,
			})

			// Store public key on server for reference
			const storeRes = await fetch('/keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					credentialId: cred.id,
					publicKey: publicKeyHex,
					address: account.address,
				}),
			})

			if (!storeRes.ok) {
				throw new Error('Failed to store credential')
			}

			// Store locally
			const storedCred: StoredCredential = {
				id: cred.id,
				publicKey: publicKeyHex,
				address: account.address,
			}
			localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(storedCred))

			setStoredCredential(storedCred)
			setAddress(account.address)
			setIsConnected(true)
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Sign up failed'
			setError(message)
			console.error('WebAuthn sign up error:', e)
		} finally {
			setIsLoading(false)
		}
	}, [])

	// Sign in - authenticate with existing passkey
	const signIn = useCallback(async () => {
		setIsLoading(true)
		setError(null)

		try {
			// Get stored credential
			const stored = localStorage.getItem(CREDENTIAL_STORAGE_KEY)
			if (!stored) {
				throw new Error('No stored credential found. Please sign up first.')
			}

			const storedCred = JSON.parse(stored) as StoredCredential

			// Verify the passkey still works by signing a random challenge
			const randomBytes = crypto.getRandomValues(new Uint8Array(32))
			const challenge = `0x${Array.from(randomBytes)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('')}` as `0x${string}`
			await WebAuthnP256.sign({
				credentialId: storedCred.id,
				challenge,
			})

			setStoredCredential(storedCred)
			setAddress(storedCred.address)
			setIsConnected(true)
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Sign in failed'
			setError(message)
			console.error('WebAuthn sign in error:', e)
		} finally {
			setIsLoading(false)
		}
	}, [])

	// Disconnect
	const disconnect = useCallback(() => {
		setAddress(null)
		setIsConnected(false)
		setStoredCredential(null)
		// Don't remove stored credential - user can sign in again
	}, [])

	// Sign a transaction using the WebAuthn credential
	// Uses viem/tempo's native WebAuthn account support with Tempo transaction format
	const signTransaction = useCallback(
		async (params: {
			to: Address
			data: HexType
			value?: bigint
		}): Promise<HexType> => {
			if (!storedCredential || !address) {
				throw new Error('Not connected')
			}

			// Create the Tempo account from the stored WebAuthn credential
			const account = TempoAccount.fromWebAuthnP256({
				id: storedCredential.id,
				publicKey: storedCredential.publicKey,
			})

			console.log('🔑 WebAuthn account address:', account.address)
			console.log('📋 Stored address:', address)
			console.log('🔑 Public key:', storedCredential.publicKey)

			// Create client with Tempo chain config extended with feeToken
			// This enables paying gas with TIP-20 stablecoins
			const chain = tempoModerato.extend({ feeToken: ALPHA_USD })
			const client = createClient({
				chain,
				transport: http('https://rpc.moderato.tempo.xyz'),
			})

			// Prepare the Tempo transaction with feeToken
			const prepared = await prepareTransactionRequest(client, {
				type: 'tempo',
				account,
				calls: [
					{
						to: params.to,
						data: params.data,
						value: params.value ?? 0n,
					},
				],
				feeToken: ALPHA_USD, // Pay gas with stablecoin
				maxPriorityFeePerGas: 1_000_000_000n, // 1 gwei
				maxFeePerGas: 10_000_000_000n, // 10 gwei
				gas: 100_000n,
				// biome-ignore lint/suspicious/noExplicitAny: required for viem internal types
			} as any)

			// Sign the prepared transaction
			const signedTx = await viemSignTransaction(client, {
				...prepared,
				account,
				// biome-ignore lint/suspicious/noExplicitAny: required for viem internal types
			} as any)

			return signedTx
		},
		[storedCredential, address],
	)

	// Get balance
	const getBalance = useCallback(async () => {
		if (!address) return null

		try {
			const balance = await publicClient.readContract({
				address: ALPHA_USD,
				abi: Abis.tip20,
				functionName: 'balanceOf',
				args: [address],
			})
			return balance
		} catch {
			return null
		}
	}, [address, publicClient])

	return {
		address,
		isConnected,
		isLoading,
		error,
		signUp,
		signIn,
		disconnect,
		signTransaction,
		getBalance,
	}
}
