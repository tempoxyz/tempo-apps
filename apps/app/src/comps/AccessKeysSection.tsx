/**
 * AccessKeysSection - A clean reimplementation of access key management
 *
 * Key design decisions based on Tempo protocol:
 * - Access keys CANNOT revoke themselves - only Root Key (passkey) can revoke
 * - Creating access keys uses keyAuthorization signed by Root Key, tx signed by new access key
 * - Revocation requires Root Key signature (will trigger passkey prompt)
 */
import * as React from 'react'
import { createPortal } from 'react-dom'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'

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
import { useTranslation } from 'react-i18next'

import { Section } from '#comps/Section'
import { cx } from '#lib/css'
import { useCopy } from '#lib/hooks'
import KeyIcon from '~icons/lucide/key-round'
import PlusIcon from '~icons/lucide/plus'
import CopyIcon from '~icons/lucide/copy'
import CheckIcon from '~icons/lucide/check'
import XIcon from '~icons/lucide/x'

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

export function formatBigIntAsUsd(
	amount: bigint,
	decimals: number,
	priceUsd: number,
): string {
	const formatted = formatUnits(amount, decimals)
	const tokenAmount = Number.parseFloat(formatted)
	const usdValue = tokenAmount * priceUsd
	if (usdValue >= 1000000) return `$${(usdValue / 1000000).toFixed(1)}M`
	if (usdValue >= 1000) return `$${(usdValue / 1000).toFixed(1)}K`
	if (usdValue >= 1) return `$${usdValue.toFixed(2)}`
	if (usdValue >= 0.01) return `$${usdValue.toFixed(2)}`
	if (usdValue > 0) return `<$0.01`
	return '$0.00'
}

function shortenAddress(address: string, chars = 4): string {
	return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function getAccessKeyEmoji(keyId: string): string | null {
	if (typeof window === 'undefined') return null
	return localStorage.getItem(`accessKeyEmoji:${keyId.toLowerCase()}`)
}

function setAccessKeyEmoji(keyId: string, emoji: string): void {
	if (typeof window === 'undefined') return
	localStorage.setItem(`accessKeyEmoji:${keyId.toLowerCase()}`, emoji)
}

function getEmojiBackgroundColor(emoji: string | null): string {
	if (!emoji) return 'rgba(59, 130, 246, 0.15)' // default blue

	const emojiColorMap: Record<string, string> = {
		// Greens
		'🐸': 'rgba(34, 197, 94, 0.2)',
		'🍀': 'rgba(34, 197, 94, 0.2)',
		'🌿': 'rgba(34, 197, 94, 0.2)',
		'🌲': 'rgba(34, 197, 94, 0.2)',
		'🥒': 'rgba(34, 197, 94, 0.2)',
		'🥦': 'rgba(34, 197, 94, 0.2)',
		'💚': 'rgba(34, 197, 94, 0.2)',
		// Blues
		'💎': 'rgba(59, 130, 246, 0.2)',
		'💙': 'rgba(59, 130, 246, 0.2)',
		'🌊': 'rgba(59, 130, 246, 0.2)',
		'🐳': 'rgba(59, 130, 246, 0.2)',
		'🦋': 'rgba(59, 130, 246, 0.2)',
		// Reds/Pinks
		'❤️': 'rgba(239, 68, 68, 0.2)',
		'🔥': 'rgba(239, 68, 68, 0.2)',
		'🌹': 'rgba(239, 68, 68, 0.2)',
		'🍎': 'rgba(239, 68, 68, 0.2)',
		'🍓': 'rgba(239, 68, 68, 0.2)',
		// Oranges
		'🧡': 'rgba(249, 115, 22, 0.2)',
		'🦊': 'rgba(249, 115, 22, 0.2)',
		'🥕': 'rgba(249, 115, 22, 0.2)',
		'🎃': 'rgba(249, 115, 22, 0.2)',
		// Yellows
		'💛': 'rgba(234, 179, 8, 0.2)',
		'⭐': 'rgba(234, 179, 8, 0.2)',
		'🌟': 'rgba(234, 179, 8, 0.2)',
		'☀️': 'rgba(234, 179, 8, 0.2)',
		'🌙': 'rgba(234, 179, 8, 0.2)',
		'🍋': 'rgba(234, 179, 8, 0.2)',
		'🍌': 'rgba(234, 179, 8, 0.2)',
		// Purples
		'💜': 'rgba(168, 85, 247, 0.2)',
		'🍇': 'rgba(168, 85, 247, 0.2)',
		'🔮': 'rgba(168, 85, 247, 0.2)',
		'🦄': 'rgba(168, 85, 247, 0.2)',
		// Grays/Metallics
		'🔑': 'rgba(156, 163, 175, 0.2)',
		'🗝️': 'rgba(156, 163, 175, 0.2)',
		'🔐': 'rgba(156, 163, 175, 0.2)',
		'🔒': 'rgba(156, 163, 175, 0.2)',
		'⚡': 'rgba(234, 179, 8, 0.2)',
		// Browns
		'🐱': 'rgba(180, 83, 9, 0.2)',
		'🦁': 'rgba(180, 83, 9, 0.2)',
		'🐻': 'rgba(180, 83, 9, 0.2)',
		// Cyans
		'🚀': 'rgba(6, 182, 212, 0.2)',
		'✈️': 'rgba(6, 182, 212, 0.2)',
	}

	return emojiColorMap[emoji] || 'rgba(59, 130, 246, 0.15)'
}

const DEFAULT_EMOJIS = [
	'🔑',
	'🗝️',
	'🔐',
	'💎',
	'⚡',
	'🚀',
	'🌟',
	'🔥',
	'🎯',
	'🎨',
	'🦊',
	'🐱',
	'🦁',
	'🐸',
	'🌙',
	'☀️',
]

function EmojiPicker({
	onSelect,
	anchorRef,
	onClose,
}: {
	selectedEmoji: string | null
	onSelect: (emoji: string) => void
	anchorRef: React.RefObject<HTMLButtonElement | null>
	onClose: () => void
}) {
	const [position, setPosition] = React.useState({ top: 0, left: 0 })
	const pickerRef = React.useRef<HTMLDivElement>(null)

	React.useLayoutEffect(() => {
		if (anchorRef.current) {
			const rect = anchorRef.current.getBoundingClientRect()
			const viewportWidth = window.innerWidth
			const viewportHeight = window.innerHeight
			const pickerWidth = 352
			const pickerHeight = 435

			let left = rect.left
			if (left + pickerWidth > viewportWidth - 8) {
				left = viewportWidth - pickerWidth - 8
			}
			if (left < 8) left = 8

			// Position above if not enough space below
			let top = rect.bottom + 8
			if (top + pickerHeight > viewportHeight - 8) {
				top = rect.top - pickerHeight - 8
			}

			setPosition({ top, left })
		}
	}, [anchorRef])

	// Close on click outside
	React.useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (
				pickerRef.current &&
				!pickerRef.current.contains(e.target as Node) &&
				anchorRef.current &&
				!anchorRef.current.contains(e.target as Node)
			) {
				onClose()
			}
		}
		document.addEventListener('mousedown', handleClick)
		return () => document.removeEventListener('mousedown', handleClick)
	}, [anchorRef, onClose])

	return createPortal(
		<div
			ref={pickerRef}
			className="fixed z-[9999]"
			style={{ top: position.top, left: position.left }}
		>
			<Picker
				data={data}
				onEmojiSelect={(emoji: { native: string }) => onSelect(emoji.native)}
				theme="dark"
				previewPosition="none"
				skinTonePosition="none"
				perLine={9}
				emojiSize={22}
				emojiButtonSize={32}
				maxFrequentRows={2}
			/>
		</div>,
		document.body,
	)
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

				console.log(
					'[AccessKeysSection] Fetching keys for',
					checksummedAddress,
					'from block',
					fromBlock.toString(),
				)

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

				console.log(
					'[AccessKeysSection] Found',
					authorizedLogs.length,
					'authorized,',
					revokedLogs.length,
					'revoked logs',
				)

				// Build revoked set
				const revokedKeyIds = new Set<string>(
					revokedLogs
						.filter((log) => log.args.publicKey)
						.map((log) => (log.args.publicKey as string).toLowerCase()),
				)

				// Build active keys list
				const allParsedKeys = authorizedLogs
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

				console.log(
					'[AccessKeysSection] All parsed keys (before expiry filter):',
					allParsedKeys.length,
					allParsedKeys.map((k) => ({
						keyId: k.keyId.slice(0, 10),
						expiry: k.expiry,
						expiryDate: k.expiry
							? new Date(k.expiry * 1000).toISOString()
							: 'never',
					})),
				)

				const basicKeys = allParsedKeys.filter(
					(k) => k.expiry === 0 || k.expiry > Math.floor(Date.now() / 1000),
				)

				console.log(
					'[AccessKeysSection] After expiry filter:',
					basicKeys.length,
					'now:',
					Math.floor(Date.now() / 1000),
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

				console.log(
					'[AccessKeysSection] Processed',
					keysWithLimits.length,
					'active keys',
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
			} catch (e) {
				console.error('[AccessKeysSection] Failed to fetch keys:', e)
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
// Get stored name for an access key
function getAccessKeyName(keyId: string): string | null {
	if (typeof window === 'undefined') return null
	const stored = localStorage.getItem(`accessKey:${keyId.toLowerCase()}`)
	if (!stored) return null
	try {
		const data = JSON.parse(stored) as { name?: string }
		return data.name || null
	} catch {
		return null
	}
}

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
	const { t } = useTranslation()
	const expiryMs = accessKey.expiry * 1000
	const isExpired = accessKey.expiry > 0 && expiryMs <= Date.now()
	const remainingLimit = asset
		? accessKey.spendingLimits.get(asset.address.toLowerCase())
		: undefined
	const originalLimit = asset
		? accessKey.originalLimits.get(asset.address.toLowerCase())
		: undefined
	const hasLimit =
		remainingLimit !== undefined ||
		accessKey.enforceLimits ||
		originalLimit !== undefined

	const [keyName, setKeyName] = React.useState<string | null>(null)
	const [emoji, setEmoji] = React.useState<string | null>(null)
	const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
	const emojiButtonRef = React.useRef<HTMLButtonElement>(null)

	React.useEffect(() => {
		if (typeof window === 'undefined') return
		setKeyName(getAccessKeyName(accessKey.keyId))
		setEmoji(getAccessKeyEmoji(accessKey.keyId))
	}, [accessKey.keyId])

	const handleEmojiSelect = (selectedEmoji: string) => {
		setAccessKeyEmoji(accessKey.keyId, selectedEmoji)
		setEmoji(selectedEmoji)
		setShowEmojiPicker(false)
	}

	const explorerUrl = txHash
		? `https://explore.mainnet.tempo.xyz/tx/${txHash}`
		: undefined
	const isClickable = (isPending || isRevoking) && explorerUrl

	const { copy, notifying: copied } = useCopy({ timeout: 1500 })

	// Display name or shortened address
	const displayName = keyName || shortenAddress(accessKey.keyId, 6)
	const displayEmoji = emoji || '🔑'

	const rowContent = (
		<>
			{/* Emoji with translucent tinted background */}
			<div className="shrink-0">
				<button
					ref={emojiButtonRef}
					type="button"
					onClick={(e) => {
						e.preventDefault()
						e.stopPropagation()
						if (isOwner) setShowEmojiPicker(!showEmojiPicker)
					}}
					className={cx(
						'flex items-center justify-center size-5 rounded-full text-[14px] transition-all',
						isOwner && 'cursor-pointer hover:scale-110',
					)}
					style={{ backgroundColor: getEmojiBackgroundColor(emoji) }}
					title={isOwner ? t('common.clickToChangeEmoji') : undefined}
				>
					{displayEmoji}
				</button>
				{showEmojiPicker && (
					<EmojiPicker
						selectedEmoji={emoji}
						onSelect={handleEmojiSelect}
						anchorRef={emojiButtonRef}
						onClose={() => setShowEmojiPicker(false)}
					/>
				)}
			</div>
			<div className="flex flex-1 min-w-0 items-center gap-2">
				<span className="text-[15px] sm:text-[16px] text-primary font-medium truncate">
					{displayName}
					{isPending && (
						<span className="text-[10px] text-accent ml-1">
							({t('common.confirming')})
						</span>
					)}
					{isRevoking && (
						<span className="text-[10px] text-accent ml-1">
							({t('common.revoking')})
						</span>
					)}
				</span>
				<span className="text-[12px] text-secondary flex items-center gap-1.5 shrink-0">
					{asset?.metadata?.symbol && (
						<span className="text-[9px] font-medium text-tertiary bg-base-alt px-1 py-0.5 rounded font-mono whitespace-nowrap">
							{asset.metadata.symbol}
						</span>
					)}
					{remainingLimit !== undefined && remainingLimit > 0n ? (
						<span>
							{formatBigIntAsUsd(
								remainingLimit,
								asset?.metadata?.decimals ?? 6,
								asset?.metadata?.priceUsd ?? 1,
							)}
						</span>
					) : hasLimit ? (
						<span className="text-negative">$0</span>
					) : (
						<span className="text-tertiary">{t('common.unlimited')}</span>
					)}
					<span className="text-tertiary">·</span>
					<span className={isExpired ? 'text-negative' : ''}>
						{accessKey.expiry === 0
							? '∞'
							: isExpired
								? t('common.exp')
								: formatExpiry(expiryMs)}
					</span>
				</span>
			</div>
			<div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation()
						e.preventDefault()
						copy(accessKey.keyId)
					}}
					title={`Copy address: ${accessKey.keyId}`}
					className="size-3.5 flex items-center justify-center rounded text-tertiary hover:text-primary transition-colors cursor-pointer"
				>
					{copied ? (
						<CheckIcon className="size-2 text-positive" />
					) : (
						<CopyIcon className="size-2" />
					)}
				</button>
				{isOwner && !isPending && !isRevoking && (
					<button
						type="button"
						onClick={onRevoke}
						title={t('common.revokeAccessKey')}
						className="size-3.5 flex items-center justify-center rounded text-negative/70 hover:text-negative transition-colors cursor-pointer"
					>
						<XIcon className="size-2" />
					</button>
				)}
			</div>
		</>
	)

	const rowClassName = cx(
		'group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:glass-thin transition-all',
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
		keyName: string,
		emoji: string,
	) => void
}) {
	const { t } = useTranslation()
	const [keyName, setKeyName] = React.useState('')
	const [selectedToken, setSelectedToken] = React.useState<Address.Address>(
		assets[0]?.address ?? ('' as Address.Address),
	)
	const [limitUsd, setLimitUsd] = React.useState('')
	const [expDays, setExpDays] = React.useState('7')
	const [selectedEmoji, setSelectedEmoji] = React.useState(
		() => DEFAULT_EMOJIS[Math.floor(Math.random() * DEFAULT_EMOJIS.length)],
	)
	const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
	const emojiButtonRef = React.useRef<HTMLButtonElement>(null)

	const asset = assets.find((a) => a.address === selectedToken)

	const handleLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value.replace(/[^0-9.]/g, '')
		const parts = raw.split('.')
		if (parts.length > 2) return
		if (parts[1] && parts[1].length > 2) return
		setLimitUsd(raw)
	}

	return (
		<div className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all">
			{/* Emoji button with tinted background */}
			<div className="shrink-0 relative">
				<button
					ref={emojiButtonRef}
					type="button"
					onClick={() => setShowEmojiPicker(!showEmojiPicker)}
					className="flex items-center justify-center size-5 rounded-full text-[14px] transition-all cursor-pointer hover:scale-110"
					style={{ backgroundColor: getEmojiBackgroundColor(selectedEmoji) }}
					title={t('common.clickToChangeEmoji')}
				>
					{selectedEmoji}
				</button>
				{showEmojiPicker && (
					<EmojiPicker
						selectedEmoji={selectedEmoji}
						onSelect={(emoji) => {
							setSelectedEmoji(emoji)
							setShowEmojiPicker(false)
						}}
						anchorRef={emojiButtonRef}
						onClose={() => setShowEmojiPicker(false)}
					/>
				)}
			</div>
			<div className="flex flex-1 min-w-0 items-center gap-2">
				<input
					type="text"
					value={keyName}
					onChange={(e) => setKeyName(e.target.value)}
					placeholder={t('common.keyName')}
					className="flex-1 min-w-0 bg-transparent text-[15px] sm:text-[16px] text-primary font-medium placeholder:text-tertiary focus:outline-none"
					autoFocus
				/>
				<span className="text-[12px] text-secondary flex items-center gap-1.5 shrink-0">
					<select
						value={selectedToken}
						onChange={(e) =>
							setSelectedToken(e.target.value as Address.Address)
						}
						className="text-secondary hover:text-primary cursor-pointer focus:outline-none appearance-none"
					>
						{assets.map((a) => (
							<option key={a.address} value={a.address}>
								{a.metadata?.symbol || shortenAddress(a.address, 3)}
							</option>
						))}
					</select>
					<span className="text-tertiary">·</span>
					<span className="flex items-center">
						<span className="text-tertiary">$</span>
						<input
							type="text"
							inputMode="decimal"
							value={limitUsd}
							onChange={handleLimitChange}
							placeholder="∞"
							className="bg-transparent w-5 placeholder:text-tertiary focus:outline-none"
						/>
					</span>
					<span className="text-tertiary">·</span>
					<span className="flex items-center gap-0.5">
						<input
							type="number"
							value={expDays}
							onChange={(e) => setExpDays(e.target.value)}
							placeholder="7"
							className="bg-transparent w-4 text-center placeholder:text-tertiary focus:outline-none"
						/>
						<span>{t('common.days')}</span>
					</span>
				</span>
			</div>
			<button
				type="button"
				onClick={() =>
					onCreate(
						selectedToken,
						asset?.metadata?.decimals ?? 6,
						limitUsd,
						Number(expDays),
						asset?.metadata?.priceUsd ?? 1,
						keyName,
						selectedEmoji,
					)
				}
				disabled={isPending}
				title={t('portfolio.createKey')}
				className="size-5 flex items-center justify-center rounded-full bg-accent text-white cursor-pointer press-down hover:bg-accent/90 transition-colors disabled:opacity-50 shrink-0"
			>
				{isPending ? (
					<span className="size-2.5 border border-white/30 border-t-white rounded-full animate-spin" />
				) : (
					<CheckIcon className="size-2.5" />
				)}
			</button>
			<button
				type="button"
				onClick={onCancel}
				title={t('common.cancel')}
				className="size-5 flex items-center justify-center rounded-full text-tertiary hover:bg-white/10 hover:text-primary transition-colors cursor-pointer shrink-0"
			>
				<XIcon className="size-2.5" />
			</button>
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
	const { t } = useTranslation()
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

	// Get token addresses for querying spending limits (stable reference)
	const tokenAddressesKey = assetsWithBalance
		.map((a) => a.address.toLowerCase())
		.sort()
		.join(',')
	const tokenAddresses = React.useMemo(
		() => (tokenAddressesKey ? tokenAddressesKey.split(',') : []),
		[tokenAddressesKey],
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
		setPendingKeys((prev) => {
			const filtered = prev.filter(
				(pk) => !onChainKeyIds.has(pk.keyId.toLowerCase()),
			)
			return filtered.length !== prev.length ? filtered : prev
		})

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
		keyName: string,
		emoji: string,
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

			// Store the private key and optional name in localStorage
			try {
				const privateKeyBytes = await crypto.subtle.exportKey(
					'pkcs8',
					keyPair.privateKey,
				)
				const privateKeyBase64 = btoa(
					String.fromCharCode(...new Uint8Array(privateKeyBytes)),
				)
				const storageKey = `accessKey:${accessKeyAddress}`
				const storageData: { privateKey: string; name?: string } = {
					privateKey: privateKeyBase64,
				}
				if (keyName.trim()) {
					storageData.name = keyName.trim()
				}
				localStorage.setItem(storageKey, JSON.stringify(storageData))
				setAccessKeyEmoji(accessKeyAddress, emoji)
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

			console.log(
				'[AccessKeysSection] Key created, tx hash:',
				hash,
				'keyId:',
				accessKeyAddress,
			)

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
		} catch (e) {
			console.error('[AccessKeysSection] Key creation failed:', e)
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
		<Section
			title={t('portfolio.accessKeys')}
			headerRight={headerPill}
			defaultOpen={false}
		>
			{isLoadingKeys ? (
				<div className="flex flex-col items-center py-4 gap-2">
					<p className="text-[13px] text-secondary">
						{t('portfolio.loadingAccessKeys')}
					</p>
				</div>
			) : allKeys.length === 0 && !showCreate ? (
				<div className="flex items-center justify-center py-4 gap-2">
					<p className="text-[13px] text-secondary">
						{t('portfolio.noAccessKeysConfigured')}
					</p>
					{isOwner && (
						<button
							type="button"
							onClick={() => setShowCreate(true)}
							disabled={isPending || assetsWithBalance.length === 0}
							className="text-[11px] font-medium bg-accent/10 text-accent rounded-full px-3 py-1 cursor-pointer press-down hover:bg-accent/20 transition-colors"
						>
							{t('portfolio.createKey')}
						</button>
					)}
				</div>
			) : (
				<div className="flex flex-col -mx-2 divide-y divide-card-border">
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
							<span>{t('common.addKey')}</span>
						</button>
					)}
				</div>
			)}
		</Section>
	)
}
