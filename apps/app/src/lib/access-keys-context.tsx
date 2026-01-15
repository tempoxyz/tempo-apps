import * as React from 'react'
import { Address } from 'ox'
import { createPublicClient, http } from 'viem'
import { getTempoChain } from '#wagmi.config'
import { fetchAccessKeyEvents } from './server/access-keys.server'

const ACCOUNT_KEYCHAIN_ADDRESS =
	'0xaAAAaaAA00000000000000000000000000000000' as const

type SignatureType = 'secp256k1' | 'p256' | 'webauthn'

export type AccessKeyData = {
	keyId: string
	signatureType: SignatureType
	expiry: number
	enforceLimits: boolean
	spendingLimits: Map<string, bigint>
	originalLimits: Map<string, bigint>
	blockNumber: bigint
	createdAt?: number
}

type AccessKeysContextValue = {
	keys: AccessKeyData[]
	isLoading: boolean
	refetch: () => void
}

const AccessKeysContext = React.createContext<AccessKeysContextValue | null>(
	null,
)

export function useAccessKeys() {
	const context = React.useContext(AccessKeysContext)
	if (!context) {
		throw new Error('useAccessKeys must be used within AccessKeysProvider')
	}
	return context
}

// Get keys that have private keys stored locally (can be used for signing)
export function useSignableAccessKeys() {
	const { keys, isLoading } = useAccessKeys()

	const signableKeys = React.useMemo(() => {
		if (typeof window === 'undefined') return []
		console.log(
			'[useSignableAccessKeys] Filtering',
			keys.length,
			'keys for local private keys',
		)
		const filtered = keys.filter((key) => {
			const storageKey = `accessKey:${key.keyId.toLowerCase()}`
			const hasKey = localStorage.getItem(storageKey) !== null
			console.log(
				'[useSignableAccessKeys] Key',
				key.keyId.slice(0, 10),
				'hasPrivateKey:',
				hasKey,
			)
			return hasKey
		})
		console.log(
			'[useSignableAccessKeys] Found',
			filtered.length,
			'signable keys',
		)
		return filtered
	}, [keys])

	return { keys: signableKeys, isLoading }
}

function parseSignatureType(sigType: number): SignatureType {
	return sigType === 1 ? 'p256' : sigType === 2 ? 'webauthn' : 'secp256k1'
}

export function AccessKeysProvider({
	accountAddress,
	tokenAddresses = [],
	children,
}: {
	accountAddress: string
	tokenAddresses?: string[]
	children: React.ReactNode
}) {
	const [keys, setKeys] = React.useState<AccessKeyData[]>([])
	const [isLoading, setIsLoading] = React.useState(true)
	const hasLoadedOnce = React.useRef(false)

	const checksummedAddress = React.useMemo(
		() => Address.checksum(accountAddress as Address.Address),
		[accountAddress],
	)

	// Stabilize tokenAddresses to prevent infinite re-renders
	const tokenAddressesKey = tokenAddresses.join(',')
	const stableTokenAddresses = React.useMemo(
		() => tokenAddresses,
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[tokenAddressesKey],
	)

	const fetchKeys = React.useCallback(async () => {
		if (typeof window === 'undefined') return
		if (!hasLoadedOnce.current) {
			setIsLoading(true)
		}

		try {
			// Fetch events from IndexSupply via server function
			const eventData = await fetchAccessKeyEvents({
				data: { account: checksummedAddress },
			})

			if (!eventData) {
				console.error('[AccessKeysProvider] Failed to fetch events')
				setIsLoading(false)
				return
			}

			// No keys found
			if (eventData.length === 0) {
				setKeys([])
				hasLoadedOnce.current = true
				setIsLoading(false)
				return
			}

			// Create viem client for RPC calls (enforceLimits, remaining limits, block timestamps)
			const chain = getTempoChain()
			const client = createPublicClient({ chain, transport: http() })

			// Fetch block timestamps for creation times
			const uniqueBlockNumbers = [
				...new Set(eventData.map((k) => BigInt(k.blockNumber))),
			]
			const blockTimestamps = new Map<bigint, number>()
			await Promise.all(
				uniqueBlockNumbers.map(async (bn) => {
					try {
						const block = await client.getBlock({ blockNumber: bn })
						blockTimestamps.set(bn, Number(block.timestamp) * 1000)
					} catch {
						// Ignore if block fetch fails
					}
				}),
			)

			// Fetch current state (enforceLimits, remaining limits) via RPC
			const keysWithLimits: AccessKeyData[] = await Promise.all(
				eventData.map(async (k) => {
					const spendingLimits = new Map<string, bigint>()
					const originalLimits = new Map<string, bigint>(
						k.originalLimits.map(([token, limit]) => [token, BigInt(limit)]),
					)
					let enforceLimits = false

					// Query the contract for enforceLimits status
					try {
						const keyData = (await client.readContract({
							address: ACCOUNT_KEYCHAIN_ADDRESS,
							abi: [
								{
									name: 'getKey',
									type: 'function',
									stateMutability: 'view',
									inputs: [
										{ type: 'address', name: 'account' },
										{ type: 'address', name: 'keyId' },
									],
									outputs: [
										{
											type: 'tuple',
											components: [
												{ type: 'uint8', name: 'signatureType' },
												{ type: 'address', name: 'keyId' },
												{ type: 'uint64', name: 'expiry' },
												{ type: 'bool', name: 'enforceLimits' },
												{ type: 'bool', name: 'isRevoked' },
											],
										},
									],
								},
							],
							functionName: 'getKey',
							args: [
								checksummedAddress as `0x${string}`,
								k.keyId as `0x${string}`,
							],
						})) as { enforceLimits: boolean }
						enforceLimits = keyData.enforceLimits
					} catch {
						// Fall back to checking if originalLimits exist
						enforceLimits = originalLimits.size > 0
					}

					// Fetch remaining limits for all tokens if enforceLimits is true
					if (enforceLimits && stableTokenAddresses.length > 0) {
						for (const tokenAddress of stableTokenAddresses) {
							try {
								const remaining = (await client.readContract({
									address: ACCOUNT_KEYCHAIN_ADDRESS,
									abi: [
										{
											name: 'getRemainingLimit',
											type: 'function',
											stateMutability: 'view',
											inputs: [
												{ type: 'address', name: 'account' },
												{ type: 'address', name: 'keyId' },
												{ type: 'address', name: 'token' },
											],
											outputs: [{ type: 'uint256' }],
										},
									],
									functionName: 'getRemainingLimit',
									args: [
										checksummedAddress as `0x${string}`,
										k.keyId as `0x${string}`,
										tokenAddress as `0x${string}`,
									],
								})) as bigint
								// Only add if there's a limit set
								if (remaining > 0n) {
									spendingLimits.set(tokenAddress.toLowerCase(), remaining)
								}
							} catch {
								// Skip if limit fetch fails
							}
						}
					}

					const blockNum = BigInt(k.blockNumber)
					return {
						keyId: k.keyId,
						signatureType: parseSignatureType(k.signatureType),
						expiry: k.expiry * 1000,
						enforceLimits,
						spendingLimits,
						originalLimits,
						blockNumber: blockNum,
						createdAt: blockTimestamps.get(blockNum),
					}
				}),
			)

			// Sort by creation time, most recent first
			keysWithLimits.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))

			setKeys(keysWithLimits)
			hasLoadedOnce.current = true
		} catch (e) {
			console.error('[AccessKeysProvider] Error fetching keys:', e)
		} finally {
			setIsLoading(false)
		}
	}, [checksummedAddress, stableTokenAddresses])

	React.useEffect(() => {
		fetchKeys()
		// Poll every 10 seconds
		const interval = setInterval(fetchKeys, 10000)
		return () => clearInterval(interval)
	}, [fetchKeys])

	const value = React.useMemo(
		() => ({ keys, isLoading, refetch: fetchKeys }),
		[keys, isLoading, fetchKeys],
	)

	return (
		<AccessKeysContext.Provider value={value}>
			{children}
		</AccessKeysContext.Provider>
	)
}
