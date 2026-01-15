import * as React from 'react'
import { Address } from 'ox'
import { createPublicClient, http } from 'viem'
import { getLogs } from 'viem/actions'
import { getTempoChain } from '#wagmi.config'

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
		return keys.filter((key) => {
			const storageKey = `accessKey:${key.keyId.toLowerCase()}`
			return localStorage.getItem(storageKey) !== null
		})
	}, [keys])

	return { keys: signableKeys, isLoading }
}

export function AccessKeysProvider({
	accountAddress,
	children,
}: {
	accountAddress: string
	children: React.ReactNode
}) {
	const [keys, setKeys] = React.useState<AccessKeyData[]>([])
	const [isLoading, setIsLoading] = React.useState(true)
	const hasLoadedOnce = React.useRef(false)

	const checksummedAddress = React.useMemo(
		() => Address.checksum(accountAddress as Address.Address),
		[accountAddress],
	)

	const fetchKeys = React.useCallback(async () => {
		if (typeof window === 'undefined') return
		if (!hasLoadedOnce.current) {
			setIsLoading(true)
		}

		try {
			const chain = getTempoChain()
			const client = createPublicClient({ chain, transport: http() })

			const blockNumber = await client.getBlockNumber()
			const fromBlock = blockNumber > 99000n ? blockNumber - 99000n : 0n

			const [authorizedLogs, revokedLogs, spendingLimitLogs] =
				await Promise.all([
					getLogs(client, {
						address: ACCOUNT_KEYCHAIN_ADDRESS,
						event: {
							type: 'event',
							name: 'KeyAuthorized',
							inputs: [
								{ type: 'address', name: 'account', indexed: true },
								{ type: 'address', name: 'publicKey', indexed: true },
								{ type: 'uint8', name: 'signatureType' },
								{ type: 'uint64', name: 'expiry' },
							],
						},
						args: { account: checksummedAddress },
						fromBlock,
						toBlock: 'latest',
					}),
					getLogs(client, {
						address: ACCOUNT_KEYCHAIN_ADDRESS,
						event: {
							type: 'event',
							name: 'KeyRevoked',
							inputs: [
								{ type: 'address', name: 'account', indexed: true },
								{ type: 'address', name: 'publicKey', indexed: true },
							],
						},
						args: { account: checksummedAddress },
						fromBlock,
						toBlock: 'latest',
					}),
					getLogs(client, {
						address: ACCOUNT_KEYCHAIN_ADDRESS,
						event: {
							type: 'event',
							name: 'SpendingLimitUpdated',
							inputs: [
								{ type: 'address', name: 'account', indexed: true },
								{ type: 'address', name: 'publicKey', indexed: true },
								{ type: 'address', name: 'token', indexed: true },
								{ type: 'uint256', name: 'newLimit' },
							],
						},
						args: { account: checksummedAddress },
						fromBlock,
						toBlock: 'latest',
					}),
				])

			// Build original limits map from events
			const originalLimitsMap = new Map<string, Map<string, bigint>>()
			for (const log of spendingLimitLogs) {
				if (log.args.publicKey && log.args.token && log.args.newLimit) {
					const keyIdLower = (log.args.publicKey as string).toLowerCase()
					const tokenLower = (log.args.token as string).toLowerCase()
					let keyLimits = originalLimitsMap.get(keyIdLower)
					if (!keyLimits) {
						keyLimits = new Map()
						originalLimitsMap.set(keyIdLower, keyLimits)
					}
					if (!keyLimits.has(tokenLower)) {
						keyLimits.set(tokenLower, log.args.newLimit as bigint)
					}
				}
			}

			// Build revoked set
			const revokedKeyIds = new Set<string>(
				revokedLogs
					.filter((log) => log.args.publicKey)
					.map((log) => (log.args.publicKey as string).toLowerCase()),
			)

			// Build active keys list
			const basicKeys = authorizedLogs
				.filter(
					(log) =>
						log.args.publicKey &&
						!revokedKeyIds.has((log.args.publicKey as string).toLowerCase()),
				)
				.map((log) => ({
					keyId: log.args.publicKey as string,
					signatureType: Number(log.args.signatureType ?? 0),
					expiry: Number(log.args.expiry ?? 0),
					blockNumber: log.blockNumber,
				}))
				.filter(
					(k) => k.expiry === 0 || k.expiry > Math.floor(Date.now() / 1000),
				)

			// Fetch block timestamps for creation times
			const uniqueBlockNumbers = [
				...new Set(basicKeys.map((k) => k.blockNumber)),
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

			// Fetch current spending limits
			const keysWithLimits: AccessKeyData[] = await Promise.all(
				basicKeys.map(async (k) => {
					const spendingLimits = new Map<string, bigint>()
					const originalLimits = originalLimitsMap.get(k.keyId.toLowerCase())
					let enforceLimits = false

					if (originalLimits && originalLimits.size > 0) {
						enforceLimits = true
						for (const [token, _originalLimit] of originalLimits) {
							try {
								const remaining = (await client.readContract({
									address: ACCOUNT_KEYCHAIN_ADDRESS,
									abi: [
										{
											type: 'function',
											name: 'spendingLimit',
											inputs: [
												{ name: 'account', type: 'address' },
												{ name: 'publicKey', type: 'address' },
												{ name: 'token', type: 'address' },
											],
											outputs: [{ name: '', type: 'uint256' }],
											stateMutability: 'view',
										},
									],
									functionName: 'spendingLimit',
									args: [
										checksummedAddress as `0x${string}`,
										k.keyId as `0x${string}`,
										token as `0x${string}`,
									],
								})) as bigint
								spendingLimits.set(token, remaining)
							} catch {
								spendingLimits.set(token, 0n)
							}
						}
					}

					const sigType: SignatureType =
						k.signatureType === 1
							? 'p256'
							: k.signatureType === 2
								? 'webauthn'
								: 'secp256k1'

					return {
						keyId: k.keyId,
						signatureType: sigType,
						expiry: k.expiry * 1000,
						enforceLimits,
						spendingLimits,
						originalLimits: originalLimits ?? new Map(),
						blockNumber: k.blockNumber,
						createdAt: blockTimestamps.get(k.blockNumber),
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
	}, [checksummedAddress])

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
