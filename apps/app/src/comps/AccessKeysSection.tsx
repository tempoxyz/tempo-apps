/**
 * AccessKeysSection - A clean reimplementation of access key management
 *
 * Key design decisions based on Tempo protocol:
 * - Access keys CANNOT revoke themselves - only Root Key (passkey) can revoke
 * - Creating access keys uses keyAuthorization signed by Root Key, tx signed by new access key
 * - Revocation requires Root Key signature (will trigger passkey prompt)
 */
import * as React from 'react'
import { Address } from 'ox'
import { WebCryptoP256 } from 'ox'
import {
	createClient,
	createPublicClient,
	encodeFunctionData,
	formatUnits,
	http,
} from 'viem'
import { sendTransaction, getLogs } from 'viem/actions'
import { Account as TempoAccount, Abis } from 'viem/tempo'
import { useAccount, useConnectorClient } from 'wagmi'
import { getTempoChain } from '#wagmi.config'
import { TokenIcon } from '#comps/TokenIcon'
import { Section } from '#comps/Section'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import KeyIcon from '~icons/lucide/key-round'
import PlusIcon from '~icons/lucide/plus'
import CopyIcon from '~icons/lucide/copy'
import CheckIcon from '~icons/lucide/check'

const ACCOUNT_KEYCHAIN_ADDRESS =
	'0xaAAAaaAA00000000000000000000000000000000' as const

// Types
type SignatureType = 'secp256k1' | 'p256' | 'webauthn'

export type AssetData = {
	address: Address.Address
	metadata:
		| { name?: string; symbol?: string; decimals?: number; priceUsd?: number }
		| undefined
	balance: string | undefined
	valueUsd: number | undefined
}

export type AccessKeyData = {
	keyId: string
	signatureType: SignatureType
	expiry: number
	enforceLimits: boolean
	spendingLimits: Map<string, bigint>
	originalLimits: Map<string, bigint>
	blockNumber: bigint
	createdAt?: number // Unix timestamp in ms
}

type PendingKey = {
	keyId: string
	expiry: number
	tokenAddress?: string
	spendingLimit?: bigint
	txHash?: `0x${string}`
}

// Utility functions
function formatExpiry(expiryMs: number): string {
	const now = Date.now()
	const remaining = expiryMs - now
	if (remaining <= 0) return 'Expired'

	const days = Math.floor(remaining / 86400000)
	const hours = Math.floor((remaining % 86400000) / 3600000)
	const minutes = Math.floor((remaining % 3600000) / 60000)

	if (days > 0) return `${days}d ${hours}h`
	if (hours > 0) return `${hours}h ${minutes}m`
	return `${minutes}m`
}

export function formatBigIntAmount(amount: bigint, decimals: number): string {
	const formatted = formatUnits(amount, decimals)
	const num = Number.parseFloat(formatted)
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
	if (num >= 1) return num.toFixed(2)
	return num.toPrecision(3)
}

function shortenAddress(address: string, chars = 4): string {
	return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatCreatedAt(timestamp: number): string {
	const now = Date.now()
	const diff = now - timestamp

	const minutes = Math.floor(diff / 60000)
	const hours = Math.floor(diff / 3600000)
	const days = Math.floor(diff / 86400000)

	if (minutes < 1) return 'just now'
	if (minutes < 60) return `${minutes}m ago`
	if (hours < 24) return `${hours}h ago`
	if (days < 7) return `${days}d ago`

	// For older dates, show the actual date
	return new Date(timestamp).toLocaleDateString()
}

// Hook for fetching on-chain access keys
export function useOnChainAccessKeys(
	accountAddress: string,
	shouldPoll: boolean,
	tokenAddresses: string[],
) {
	const [keys, setKeys] = React.useState<AccessKeyData[]>([])
	const [isLoading, setIsLoading] = React.useState(true)
	const hasLoadedOnce = React.useRef(false)

	const checksummedAddress = React.useMemo(
		() => Address.checksum(accountAddress as Address.Address),
		[accountAddress],
	)

	const refetch = React.useCallback(() => {
		// No-op, polling handles updates
	}, [])

	React.useEffect(() => {
		if (typeof window === 'undefined') return
		let cancelled = false

		const fetchKeys = async () => {
			// Only show loading on very first fetch ever
			if (!hasLoadedOnce.current) {
				setIsLoading(true)
			}
			try {
				const chain = getTempoChain()
				const client = createPublicClient({ chain, transport: http() })

				const blockNumber = await client.getBlockNumber()
				const fromBlock = blockNumber > 99000n ? blockNumber - 99000n : 0n

				// Fetch all relevant events in parallel
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

				// Fetch current spending limits for each key
				const keysWithLimits: AccessKeyData[] = await Promise.all(
					basicKeys.map(async (k) => {
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
								args: [checksummedAddress, k.keyId as `0x${string}`],
							})) as { enforceLimits: boolean }

							// Get original limits for this key from events (used for updates)
							const keyOriginalLimits =
								originalLimitsMap.get(k.keyId.toLowerCase()) ?? new Map()

							// Fetch current remaining limits for all tokens if enforceLimits is true
							const spendingLimits = new Map<string, bigint>()
							if (keyData.enforceLimits && tokenAddresses.length > 0) {
								for (const tokenAddress of tokenAddresses) {
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
												checksummedAddress,
												k.keyId as `0x${string}`,
												tokenAddress as `0x${string}`,
											],
										})) as bigint
										// Only add if there's a limit set (remaining > 0 means limit exists)
										if (remaining > 0n) {
											spendingLimits.set(tokenAddress.toLowerCase(), remaining)
										}
									} catch {
										// Skip if limit fetch fails
									}
								}
							}

							return {
								keyId: k.keyId,
								signatureType:
									k.signatureType === 1
										? ('p256' as const)
										: ('secp256k1' as const),
								expiry: k.expiry,
								enforceLimits: keyData.enforceLimits,
								spendingLimits,
								originalLimits: keyOriginalLimits,
								blockNumber: k.blockNumber,
								createdAt: blockTimestamps.get(k.blockNumber),
							}
						} catch {
							return {
								keyId: k.keyId,
								signatureType:
									k.signatureType === 1
										? ('p256' as const)
										: ('secp256k1' as const),
								expiry: k.expiry,
								enforceLimits: false,
								spendingLimits: new Map<string, bigint>(),
								originalLimits:
									originalLimitsMap.get(k.keyId.toLowerCase()) ?? new Map(),
								blockNumber: k.blockNumber,
								createdAt: blockTimestamps.get(k.blockNumber),
							}
						}
					}),
				)

				if (!cancelled) {
					// Only update state if keys actually changed (compare by keyId set)
					setKeys((prevKeys) => {
						const prevKeyIds = new Set(
							prevKeys.map((k) => k.keyId.toLowerCase()),
						)
						const newKeyIds = new Set(
							keysWithLimits.map((k) => k.keyId.toLowerCase()),
						)

						// Check if key sets are different
						if (
							prevKeyIds.size !== newKeyIds.size ||
							[...prevKeyIds].some((id) => !newKeyIds.has(id))
						) {
							return keysWithLimits
						}
						return prevKeys
					})
				}
			} catch {
				// Failed to fetch keys
			} finally {
				if (!cancelled && !hasLoadedOnce.current) {
					setIsLoading(false)
					hasLoadedOnce.current = true
				}
			}
		}

		fetchKeys()

		// Only poll when there are pending/revoking keys
		let pollInterval: ReturnType<typeof setInterval> | undefined
		if (shouldPoll) {
			pollInterval = setInterval(fetchKeys, 2000)
		}

		return () => {
			cancelled = true
			if (pollInterval) clearInterval(pollInterval)
		}
	}, [checksummedAddress, shouldPoll, tokenAddresses])

	return { keys, isLoading, refetch }
}

// Sub-components
function AccessKeyRow({
	accessKey,
	asset,
	isPending,
	isRevoking,
	isOwner,
	onRevoke,
	txHash,
}: {
	accessKey: AccessKeyData
	asset: AssetData | undefined
	isPending: boolean
	isRevoking: boolean
	isOwner: boolean
	onRevoke: () => void
	txHash?: `0x${string}`
}) {
	const expiryMs = accessKey.expiry * 1000
	const isExpired = accessKey.expiry > 0 && expiryMs <= Date.now()
	const remainingLimit = asset
		? accessKey.spendingLimits.get(asset.address.toLowerCase())
		: undefined
	const originalLimit = asset
		? accessKey.originalLimits.get(asset.address.toLowerCase())
		: undefined
	// Use remaining limit if available, otherwise check if enforceLimits is true
	const hasLimit =
		remainingLimit !== undefined ||
		accessKey.enforceLimits ||
		originalLimit !== undefined

	// Check if private key is available in localStorage
	const [hasPrivateKey, setHasPrivateKey] = React.useState<boolean | null>(null)
	React.useEffect(() => {
		if (typeof window === 'undefined') return
		const stored = localStorage.getItem(
			`accessKey:${accessKey.keyId.toLowerCase()}`,
		)
		setHasPrivateKey(stored !== null)
	}, [accessKey.keyId])

	const explorerUrl = txHash
		? `https://explore.mainnet.tempo.xyz/tx/${txHash}`
		: undefined
	const isClickable = (isPending || isRevoking) && explorerUrl

	const { copy, notifying: copied } = useCopy({ timeout: 1500 })

	const rowContent = (
		<>
			{asset && <TokenIcon address={asset.address} className="size-[24px]" />}
			<div className="flex flex-col flex-1 min-w-0">
				<span className="text-[12px] text-primary font-mono break-all flex items-center gap-1">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							copy(accessKey.keyId)
						}}
						className="hover:text-accent transition-colors cursor-pointer text-left"
						title="Click to copy"
					>
						{accessKey.keyId}
					</button>
					{copied && (
						<CheckIcon className="size-[12px] text-positive shrink-0" />
					)}
					{!copied && (
						<CopyIcon className="size-[12px] text-tertiary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
					)}
					{isPending && (
						<span className="ml-1 text-[10px] text-accent underline">
							(confirming...)
						</span>
					)}
					{isRevoking && (
						<span className="ml-1 text-[10px] text-accent underline">
							(revoking...)
						</span>
					)}
				</span>
				<span className="text-[10px] text-tertiary flex items-center gap-1.5 flex-wrap">
					{asset?.metadata?.symbol && (
						<>
							{isClickable ? (
								<span className="text-secondary font-medium">
									{asset.metadata.symbol}
								</span>
							) : (
								<a
									href={`https://explore.mainnet.tempo.xyz/token/${asset.address}`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-secondary font-medium hover:text-accent transition-colors"
								>
									{asset.metadata.symbol}
								</a>
							)}
							<span>·</span>
						</>
					)}
					{remainingLimit !== undefined && remainingLimit > 0n ? (
						<>
							<span>
								{formatBigIntAmount(
									remainingLimit,
									asset?.metadata?.decimals ?? 6,
								)}{' '}
								remaining
							</span>
							<span>·</span>
						</>
					) : hasLimit ? (
						<>
							<span className="text-negative">Limit exhausted</span>
							<span>·</span>
						</>
					) : (
						<>
							<span>Unlimited</span>
							<span>·</span>
						</>
					)}
					<span className={isExpired ? 'text-negative' : ''}>
						{accessKey.expiry === 0
							? 'No expiry'
							: isExpired
								? 'Expired'
								: `${formatExpiry(expiryMs)} left`}
					</span>
					{accessKey.createdAt && (
						<>
							<span>·</span>
							<span>Created {formatCreatedAt(accessKey.createdAt)}</span>
						</>
					)}
					{hasPrivateKey !== null && (
						<>
							<span>·</span>
							{hasPrivateKey ? (
								<span className="text-positive">Available</span>
							) : (
								<span className="text-negative">Key not in localStorage</span>
							)}
						</>
					)}
				</span>
			</div>
			{isOwner && !isPending && !isRevoking && (
				<button
					type="button"
					onClick={onRevoke}
					title="Revoke this access key (requires passkey signature)"
					className="text-[11px] font-medium bg-negative/10 text-negative rounded px-1.5 py-0.5 cursor-pointer press-down hover:bg-negative/20 transition-colors"
				>
					Revoke
				</button>
			)}
		</>
	)

	const rowClassName = cx(
		'group flex items-center gap-2.5 px-3 h-[48px] rounded-xl hover:glass-thin transition-all',
		(isPending || isRevoking) && 'opacity-50',
		isClickable && 'cursor-pointer',
	)

	if (isClickable) {
		return (
			<a
				href={explorerUrl}
				target="_blank"
				rel="noopener noreferrer"
				className={rowClassName}
			>
				{rowContent}
			</a>
		)
	}

	return <div className={rowClassName}>{rowContent}</div>
}

function CreateKeyForm({
	assets,
	isPending,
	onCancel,
	onCreate,
}: {
	assets: AssetData[]
	isPending: boolean
	onCancel: () => void
	onCreate: (
		tokenAddress: string,
		decimals: number,
		limitUsd: string,
		expDays: number,
		priceUsd: number,
	) => void
}) {
	const [selectedToken, setSelectedToken] = React.useState<Address.Address>(
		assets[0]?.address ?? ('' as Address.Address),
	)
	const [limitUsd, setLimitUsd] = React.useState('')
	const [expDays, setExpDays] = React.useState('7')

	const asset = assets.find((a) => a.address === selectedToken)

	const handleLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value.replace(/[^0-9.]/g, '')
		const parts = raw.split('.')
		if (parts.length > 2) return
		if (parts[1] && parts[1].length > 2) return
		setLimitUsd(raw)
	}

	return (
		<div className="flex flex-col gap-3 px-3 py-3 bg-base-alt/30 rounded-lg mx-2">
			<div className="flex items-center gap-3">
				<div className="flex flex-col gap-1">
					<label className="text-[9px] text-tertiary uppercase tracking-wide">
						Token
					</label>
					<select
						value={selectedToken}
						onChange={(e) =>
							setSelectedToken(e.target.value as Address.Address)
						}
						className="h-[28px] px-2 text-[11px] rounded border border-base-border bg-surface min-w-[80px]"
					>
						{assets.map((a) => (
							<option key={a.address} value={a.address}>
								{a.metadata?.symbol || shortenAddress(a.address, 3)}
							</option>
						))}
					</select>
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-[9px] text-tertiary uppercase tracking-wide">
						Limit
					</label>
					<div className="h-[28px] px-2 text-[11px] rounded border border-base-border bg-surface flex items-center w-[80px]">
						<span className={limitUsd ? 'text-primary' : 'text-tertiary'}>
							$
						</span>
						<input
							type="text"
							inputMode="decimal"
							value={limitUsd}
							onChange={handleLimitChange}
							placeholder="0.00"
							className="bg-transparent outline-none w-full placeholder:text-tertiary"
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1">
					<label className="text-[9px] text-tertiary uppercase tracking-wide">
						Expires
					</label>
					<div className="flex items-center gap-1">
						<input
							type="number"
							value={expDays}
							onChange={(e) => setExpDays(e.target.value)}
							placeholder="7"
							className="h-[28px] w-[50px] px-2 text-[11px] rounded border border-base-border bg-surface"
						/>
						<span className="text-[10px] text-tertiary">days</span>
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={() =>
						onCreate(
							selectedToken,
							asset?.metadata?.decimals ?? 6,
							limitUsd,
							Number(expDays),
							asset?.metadata?.priceUsd ?? 1,
						)
					}
					disabled={isPending}
					className="text-[11px] font-medium bg-accent text-white rounded px-2 py-1 cursor-pointer press-down hover:bg-accent/90 transition-colors disabled:opacity-50"
				>
					{isPending ? '...' : 'Create'}
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="text-[11px] text-secondary hover:text-primary transition-colors cursor-pointer"
				>
					Cancel
				</button>
			</div>
		</div>
	)
}

// Main component
export function AccessKeysSection({
	assets,
	accountAddress,
}: {
	assets: AssetData[]
	accountAddress: string
}) {
	const account = useAccount()
	const { data: connectorClient } = useConnectorClient()

	const [showCreate, setShowCreate] = React.useState(false)
	const [isPending, setIsPending] = React.useState(false)
	const [pendingKeys, setPendingKeys] = React.useState<PendingKey[]>([])
	// Map of keyId -> txHash for keys being revoked
	const [revokingKeys, setRevokingKeys] = React.useState<
		Map<string, `0x${string}`>
	>(new Map())

	const isOwner =
		account.address?.toLowerCase() === accountAddress.toLowerCase()
	const assetsWithBalance = assets.filter((a) => a.balance && a.balance !== '0')

	// Get token addresses for querying spending limits
	const tokenAddresses = React.useMemo(
		() => assetsWithBalance.map((a) => a.address),
		[assetsWithBalance],
	)

	// Only poll when there are pending or revoking keys
	const shouldPoll = pendingKeys.length > 0 || revokingKeys.size > 0
	const { keys: onChainKeys, isLoading: isLoadingKeys } = useOnChainAccessKeys(
		accountAddress,
		shouldPoll,
		tokenAddresses,
	)

	// Clear pending keys when they appear on-chain, clear revoking keys when they disappear
	React.useEffect(() => {
		const onChainKeyIds = new Set(onChainKeys.map((k) => k.keyId.toLowerCase()))

		// Remove pending keys that are now confirmed on-chain
		setPendingKeys((prev) =>
			prev.filter((pk) => !onChainKeyIds.has(pk.keyId.toLowerCase())),
		)

		// Remove revoking keys that are no longer on-chain (revocation confirmed)
		setRevokingKeys((prev) => {
			const updated = new Map(prev)
			for (const keyId of prev.keys()) {
				if (!onChainKeyIds.has(keyId)) {
					updated.delete(keyId)
				}
			}
			return updated.size !== prev.size ? updated : prev
		})
	}, [onChainKeys])

	const handleCreate = async (
		tokenAddress: string,
		decimals: number,
		limitUsd: string,
		expDays: number,
		priceUsd: number,
	) => {
		if (!isOwner || !account.address || !connectorClient?.account) return

		const limitUsdNum = Number(limitUsd)
		const effectivePriceUsd = priceUsd > 0 ? priceUsd : 1
		const limitTokenAmount =
			limitUsdNum > 0 ? limitUsdNum / effectivePriceUsd : 0

		setIsPending(true)
		try {
			// Create WebCrypto P256 key pair for the access key
			// extractable: true is required so we can derive the public key/address
			const keyPair = await WebCryptoP256.createKeyPair({ extractable: true })

			// Create access key account linked to primary account
			const accessKey = TempoAccount.fromWebCryptoP256(keyPair, {
				access: connectorClient.account,
			})

			// Derive the access key's own address from its public key
			const accessKeyAddress = Address.fromPublicKey(
				keyPair.publicKey,
			).toLowerCase()

			// Store the private key in localStorage so it can be used for signing later
			try {
				const privateKeyBytes = await crypto.subtle.exportKey(
					'pkcs8',
					keyPair.privateKey,
				)
				const privateKeyBase64 = btoa(
					String.fromCharCode(...new Uint8Array(privateKeyBytes)),
				)
				const storageKey = `accessKey:${accessKeyAddress}`
				localStorage.setItem(
					storageKey,
					JSON.stringify({ privateKey: privateKeyBase64 }),
				)
			} catch {
				// Ignore storage errors
			}

			// Calculate expiry
			const expiry =
				expDays > 0
					? Math.floor((Date.now() + expDays * 86400000) / 1000)
					: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000)

			// Build spending limits
			const limits =
				limitTokenAmount > 0
					? [
							{
								token: tokenAddress as `0x${string}`,
								limit: BigInt(Math.floor(limitTokenAmount * 10 ** decimals)),
							},
						]
					: undefined

			// Root Key signs key authorization (triggers passkey prompt)
			const keyAuthorization = await TempoAccount.signKeyAuthorization(
				connectorClient.account as Parameters<
					typeof TempoAccount.signKeyAuthorization
				>[0],
				{ key: accessKey, expiry, limits },
			)

			// Access key signs the actual transaction (no passkey prompt)
			const accessKeyClient = createClient({
				account: accessKey,
				chain: connectorClient.chain,
				transport: http(),
			})

			const hash = await sendTransaction(accessKeyClient, {
				to: '0x0000000000000000000000000000000000000000',
				feeToken: '0x20c000000000000000000000033abb6ac7d235e5',
				keyAuthorization,
			})

			// Optimistically show pending key (use derived accessKeyAddress, not accessKey.address which is root account)
			setPendingKeys((prev) => [
				...prev,
				{
					keyId: accessKeyAddress,
					expiry,
					tokenAddress: limitTokenAmount > 0 ? tokenAddress : undefined,
					spendingLimit:
						limitTokenAmount > 0
							? BigInt(Math.floor(limitTokenAmount * 10 ** decimals))
							: undefined,
					txHash: hash,
				},
			])
		} catch {
			// Key creation failed
		} finally {
			setIsPending(false)
			setShowCreate(false)
		}
	}

	/**
	 * Revoke an access key.
	 * IMPORTANT: This MUST be signed by the Root Key (passkey).
	 * Access keys cannot revoke themselves per protocol design.
	 */
	const handleRevoke = async (keyId: string) => {
		if (!isOwner || !connectorClient?.account) return

		setIsPending(true)
		try {
			// This calls revokeKey on AccountKeychain precompile
			// The Root Key (passkey) MUST sign this - user will see passkey prompt
			const hash = await sendTransaction(connectorClient, {
				to: ACCOUNT_KEYCHAIN_ADDRESS,
				data: encodeFunctionData({
					abi: Abis.accountKeychain,
					functionName: 'revokeKey',
					args: [keyId as `0x${string}`],
				}),
				feeToken: '0x20c000000000000000000000033abb6ac7d235e5',
			})

			// Optimistically mark the key as revoking with its txHash
			setRevokingKeys((prev) => new Map(prev).set(keyId.toLowerCase(), hash))
		} catch {
			// Key revocation failed
		} finally {
			setIsPending(false)
		}
	}

	// Merge on-chain keys with pending keys
	const allKeys = React.useMemo(() => {
		const confirmedKeyIds = new Set(
			onChainKeys.map((k) => k.keyId.toLowerCase()),
		)

		// Convert pending keys to display format
		const pendingItems = pendingKeys
			.filter((pk) => !confirmedKeyIds.has(pk.keyId.toLowerCase()))
			.map((pk) => {
				const asset = pk.tokenAddress
					? assetsWithBalance.find(
							(a) => a.address.toLowerCase() === pk.tokenAddress?.toLowerCase(),
						)
					: assetsWithBalance[0]

				return {
					key: {
						keyId: pk.keyId,
						signatureType: 'p256' as SignatureType,
						expiry: pk.expiry,
						enforceLimits: pk.spendingLimit !== undefined,
						spendingLimits:
							pk.spendingLimit && pk.tokenAddress
								? new Map([[pk.tokenAddress.toLowerCase(), pk.spendingLimit]])
								: new Map<string, bigint>(),
						originalLimits:
							pk.spendingLimit && pk.tokenAddress
								? new Map([[pk.tokenAddress.toLowerCase(), pk.spendingLimit]])
								: new Map<string, bigint>(),
						blockNumber: 0n,
					},
					asset,
					isPending: true,
					txHash: pk.txHash,
				}
			})

		// Convert confirmed keys (include revoking ones so they can show status)
		const confirmedItems = onChainKeys
			.slice()
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
			.map((k) => {
				// Find asset with spending limit (check spendingLimits first, then originalLimits)
				const assetWithLimit = assetsWithBalance.find(
					(a) =>
						k.spendingLimits.has(a.address.toLowerCase()) ||
						k.originalLimits.has(a.address.toLowerCase()),
				)
				const revokeTxHash = revokingKeys.get(k.keyId.toLowerCase())
				return {
					key: k,
					asset: assetWithLimit ?? assetsWithBalance[0],
					isPending: false,
					txHash: revokeTxHash,
				}
			})

		return [...pendingItems, ...confirmedItems]
	}, [onChainKeys, pendingKeys, assetsWithBalance, revokingKeys])

	const headerPill =
		allKeys.length > 0 ? (
			<span className="flex items-center gap-1 px-1 h-[24px] bg-base-alt rounded-md text-[11px] text-secondary">
				<KeyIcon className="size-[12px]" />
				<span className="font-mono font-medium">{allKeys.length}</span>
			</span>
		) : null

	return (
		<Section title="Access Keys" headerRight={headerPill} defaultOpen={false}>
			{isLoadingKeys ? (
				<div className="flex flex-col items-center py-4 gap-2">
					<p className="text-[13px] text-secondary">Loading access keys...</p>
				</div>
			) : allKeys.length === 0 && !showCreate ? (
				<div className="flex flex-col items-center py-4 gap-2">
					<p className="text-[13px] text-secondary">
						No access keys configured.
					</p>
					{isOwner && (
						<button
							type="button"
							onClick={() => setShowCreate(true)}
							disabled={isPending || assetsWithBalance.length === 0}
							className="text-[11px] font-medium bg-accent/10 text-accent rounded px-2 py-1 cursor-pointer press-down hover:bg-accent/20 transition-colors"
						>
							Create Key
						</button>
					)}
				</div>
			) : (
				<div className="flex flex-col -mx-2">
					{allKeys.map(
						({ key, asset, isPending: isKeyPending, txHash: keyTxHash }) => (
							<AccessKeyRow
								key={key.keyId}
								accessKey={key}
								asset={asset}
								isPending={isKeyPending}
								isRevoking={revokingKeys.has(key.keyId.toLowerCase())}
								isOwner={isOwner}
								onRevoke={() => handleRevoke(key.keyId)}
								txHash={keyTxHash}
							/>
						),
					)}

					{showCreate && (
						<CreateKeyForm
							assets={assetsWithBalance}
							isPending={isPending}
							onCancel={() => setShowCreate(false)}
							onCreate={handleCreate}
						/>
					)}

					{!showCreate && isOwner && (
						<button
							type="button"
							onClick={() => setShowCreate(true)}
							disabled={isPending}
							className="flex items-center gap-1 px-3 h-[36px] text-[11px] text-secondary hover:text-accent transition-colors cursor-pointer"
						>
							<PlusIcon className="size-[12px]" />
							<span>Add key</span>
						</button>
					)}
				</div>
			)}
		</Section>
	)
}
