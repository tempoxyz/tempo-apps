import * as Address from 'ox/Address'
import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import * as Value from 'ox/Value'
import type { ContractInfo } from './contracts'
import { isTip20Address } from './tip20'

const FEE_MANAGER_ADDRESS = '0xfeec000000000000000000000000000000000000'
const PATH_USD_ADDRESS = '0x20c0000000000000000000000000000000000000'
const PATH_USD_META = { symbol: 'PathUSD', decimals: 6 }

export type StorageDecodeContext = {
	account: Hex.Hex
	contractInfo?: ContractInfo
	candidateAddresses: Hex.Hex[]
	token?: { symbol?: string; decimals?: number }
	allTokenMetadata?: Record<string, { symbol?: string; decimals?: number }>
}

export type DecodedStorageChange = {
	slotLabel: string
	slotRaw: Hex.Hex
	beforeDisplay: string
	afterDisplay: string
	beforeRaw: Hex.Hex
	afterRaw: Hex.Hex
	kind?: 'balance' | 'allowance' | 'uint256' | 'address' | 'bytes32'
	diff?: {
		display: string
		isPositive: boolean
	}
}

export type StorageChange = {
	slot: Hex.Hex
	before: Hex.Hex
	after: Hex.Hex
}

function computeMappingSlot(key: Hex.Hex, baseSlot: number): Hex.Hex {
	const paddedKey = Hex.padLeft(key.toLowerCase() as Hex.Hex, 32)
	const paddedSlot = Hex.padLeft(Hex.fromNumber(baseSlot), 32)
	const concatenated = Hex.concat(paddedKey, paddedSlot)
	return Hash.keccak256(concatenated)
}

function computeNestedMappingSlot(
	outerKey: Hex.Hex,
	innerKey: Hex.Hex,
	baseSlot: number,
): Hex.Hex {
	const firstLevelSlot = computeMappingSlot(outerKey, baseSlot)
	const paddedInnerKey = Hex.padLeft(innerKey.toLowerCase() as Hex.Hex, 32)
	const concatenated = Hex.concat(paddedInnerKey, firstLevelSlot)
	return Hash.keccak256(concatenated)
}

function formatAddress(address: Hex.Hex): string {
	return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function formatTokenAmount(
	value: Hex.Hex,
	decimals?: number,
	symbol?: string,
): string {
	const bigValue = Hex.toBigInt(value)
	if (bigValue === 0n) return '0'

	if (decimals !== undefined) {
		const formatted = Value.format(bigValue, decimals)
		const num = Number(formatted)
		const display =
			num > 0 && num < 0.0001
				? '<0.0001'
				: new Intl.NumberFormat('en-US', {
						maximumFractionDigits: 6,
						minimumFractionDigits: 0,
					}).format(num)
		return symbol ? `${display} ${symbol}` : display
	}

	return bigValue.toLocaleString('en-US')
}

function computeDiff(
	before: Hex.Hex,
	after: Hex.Hex,
	decimals?: number,
	symbol?: string,
): { display: string; isPositive: boolean } | undefined {
	const beforeBig = Hex.toBigInt(before)
	const afterBig = Hex.toBigInt(after)

	if (beforeBig === afterBig) return undefined

	const diff = afterBig - beforeBig
	const isPositive = diff > 0n
	const absDiff = isPositive ? diff : -diff

	if (decimals !== undefined) {
		const formatted = Value.format(absDiff, decimals)
		const num = Number(formatted)
		const display =
			num > 0 && num < 0.0001
				? '<0.0001'
				: new Intl.NumberFormat('en-US', {
						maximumFractionDigits: 6,
						minimumFractionDigits: 0,
					}).format(num)
		const prefix = isPositive ? '+' : '-'
		return {
			display: symbol ? `${prefix}${display} ${symbol}` : `${prefix}${display}`,
			isPositive,
		}
	}

	const prefix = isPositive ? '+' : '-'
	return {
		display: `${prefix}${absDiff.toLocaleString('en-US')}`,
		isPositive,
	}
}

function isAddressLike(value: Hex.Hex): boolean {
	if (value.length !== 66) return false
	const upper12 = value.slice(2, 26)
	return upper12 === '000000000000000000000000'
}

function extractAddress(value: Hex.Hex): Hex.Hex {
	return `0x${value.slice(26)}` as Hex.Hex
}

function tryDecodeAsAddress(value: Hex.Hex): string | null {
	if (!isAddressLike(value)) return null
	const addr = extractAddress(value)
	if (Hex.toBigInt(addr) === 0n) return null
	try {
		return Address.checksum(addr as Address.Address)
	} catch {
		return addr
	}
}

export function decodeStorageChange(
	change: StorageChange,
	ctx: StorageDecodeContext,
): DecodedStorageChange | null {
	const { account, candidateAddresses, token, contractInfo } = ctx
	const isToken = isTip20Address(account) || contractInfo?.category === 'token'

	if (isToken && candidateAddresses.length > 0) {
		const slotLower = change.slot.toLowerCase()

		// TIP20/ERC20 balance slots - check common base slots
		// Slot 0 is standard ERC20, slot 9 is common for upgradeable/TIP20 tokens
		const balanceSlotCandidates = [0, 9, 1, 2, 3, 4, 5, 51, 101]
		for (const baseSlot of balanceSlotCandidates) {
			for (const addr of candidateAddresses) {
				const balanceSlot = computeMappingSlot(addr, baseSlot)
				if (balanceSlot.toLowerCase() === slotLower) {
					return {
						slotLabel: `balances[${formatAddress(addr)}]`,
						slotRaw: change.slot,
						beforeDisplay: formatTokenAmount(
							change.before,
							token?.decimals,
							token?.symbol,
						),
						afterDisplay: formatTokenAmount(
							change.after,
							token?.decimals,
							token?.symbol,
						),
						beforeRaw: change.before,
						afterRaw: change.after,
						kind: 'balance',
						diff: computeDiff(
							change.before,
							change.after,
							token?.decimals,
							token?.symbol,
						),
					}
				}
			}
		}

		// TIP20/ERC20 allowance slots - check common base slots
		const allowanceSlotCandidates = [1, 10, 2, 3, 4, 5, 52, 102]
		for (const baseSlot of allowanceSlotCandidates) {
			for (const owner of candidateAddresses) {
				for (const spender of candidateAddresses) {
					if (owner.toLowerCase() === spender.toLowerCase()) continue
					const allowanceSlot = computeNestedMappingSlot(
						owner,
						spender,
						baseSlot,
					)
					if (allowanceSlot.toLowerCase() === slotLower) {
						return {
							slotLabel: `allowances[${formatAddress(owner)}][${formatAddress(spender)}]`,
							slotRaw: change.slot,
							beforeDisplay: formatTokenAmount(
								change.before,
								token?.decimals,
								token?.symbol,
							),
							afterDisplay: formatTokenAmount(
								change.after,
								token?.decimals,
								token?.symbol,
							),
							beforeRaw: change.before,
							afterRaw: change.after,
							kind: 'allowance',
							diff: computeDiff(
								change.before,
								change.after,
								token?.decimals,
								token?.symbol,
							),
						}
					}
				}
			}
		}
	}

	// Fee Manager specific decoding
	if (account.toLowerCase() === FEE_MANAGER_ADDRESS) {
		const decoded = decodeFeeManagerSlot(change, ctx)
		if (decoded) return decoded
	}

	return decodeGenericValue(change)
}

// Fee Manager storage layout:
// slot 0: validatorTokens mapping (address => address)
// slot 1: userTokens mapping (address => address)
// slot 2: collectedFees mapping (address validator => address token => uint256)
// slot 3: pools mapping (bytes32 poolId => Pool struct) - inherited from FeeAMM
//         Pool struct: { uint128 reserveUserToken, uint128 reserveValidatorToken }
function decodeFeeManagerSlot(
	change: StorageChange,
	ctx: StorageDecodeContext,
): DecodedStorageChange | null {
	const { candidateAddresses, allTokenMetadata } = ctx
	const slotLower = change.slot.toLowerCase()

	// Token candidates from tx addresses and metadata, plus PathUSD (always used in fees)
	const tokenCandidatesSet = new Set<string>([PATH_USD_ADDRESS])
	for (const addr of candidateAddresses) {
		if (isTip20Address(addr)) {
			tokenCandidatesSet.add(addr.toLowerCase())
		}
	}
	if (allTokenMetadata) {
		for (const addr of Object.keys(allTokenMetadata)) {
			if (isTip20Address(addr)) {
				tokenCandidatesSet.add(addr.toLowerCase())
			}
		}
	}
	const tokenCandidates = Array.from(tokenCandidatesSet) as Hex.Hex[]

	// Helper to get token display name
	const getTokenDisplay = (addr: string | null): string => {
		if (!addr) return '(none)'
		const lower = addr.toLowerCase()
		// Check passed metadata first
		const meta = allTokenMetadata?.[lower]
		if (meta?.symbol) return meta.symbol
		// Check hardcoded PathUSD
		if (lower === PATH_USD_ADDRESS) return PATH_USD_META.symbol
		// Fallback to formatted address
		return formatAddress(addr as Hex.Hex)
	}

	// Try to match validatorTokens[address] at slot 0
	// This mapping stores which token a validator receives fees in
	for (const addr of candidateAddresses) {
		const slot = computeMappingSlot(addr, 0)
		if (slot.toLowerCase() === slotLower) {
			const beforeToken = tryDecodeAsAddress(change.before)
			const afterToken = tryDecodeAsAddress(change.after)

			return {
				slotLabel: `validatorTokens[${formatAddress(addr)}]`,
				slotRaw: change.slot,
				beforeDisplay: getTokenDisplay(beforeToken),
				afterDisplay: getTokenDisplay(afterToken),
				beforeRaw: change.before,
				afterRaw: change.after,
				kind: 'address',
			}
		}
	}

	// Try to match userTokens[address] at slot 1
	// This mapping stores which token a user pays fees in
	for (const addr of candidateAddresses) {
		const slot = computeMappingSlot(addr, 1)
		if (slot.toLowerCase() === slotLower) {
			const beforeToken = tryDecodeAsAddress(change.before)
			const afterToken = tryDecodeAsAddress(change.after)

			return {
				slotLabel: `userTokens[${formatAddress(addr)}]`,
				slotRaw: change.slot,
				beforeDisplay: getTokenDisplay(beforeToken),
				afterDisplay: getTokenDisplay(afterToken),
				beforeRaw: change.before,
				afterRaw: change.after,
				kind: 'address',
			}
		}
	}

	// Try to match collectedFees[validator][token] at slot 2
	const validatorCandidates = [
		'0x0000000000000000000000000000000000000000' as Hex.Hex,
		...candidateAddresses,
	]

	for (const validator of validatorCandidates) {
		for (const tokenAddr of tokenCandidates) {
			const slot = computeNestedMappingSlot(validator, tokenAddr, 2)
			if (slot.toLowerCase() === slotLower) {
				const tokenMeta =
					allTokenMetadata?.[tokenAddr.toLowerCase()] ??
					(tokenAddr.toLowerCase() === PATH_USD_ADDRESS
						? PATH_USD_META
						: undefined)
				const validatorLabel =
					validator === '0x0000000000000000000000000000000000000000'
						? 'validator'
						: formatAddress(validator)
				const tokenLabel = tokenMeta?.symbol ?? formatAddress(tokenAddr)

				return {
					slotLabel: `collectedFees[${validatorLabel}][${tokenLabel}]`,
					slotRaw: change.slot,
					beforeDisplay: formatTokenAmount(
						change.before,
						tokenMeta?.decimals,
						tokenMeta?.symbol,
					),
					afterDisplay: formatTokenAmount(
						change.after,
						tokenMeta?.decimals,
						tokenMeta?.symbol,
					),
					beforeRaw: change.before,
					afterRaw: change.after,
					kind: 'balance',
					diff: computeDiff(
						change.before,
						change.after,
						tokenMeta?.decimals,
						tokenMeta?.symbol,
					),
				}
			}
		}
	}

	// Try to match pools[poolId] at slot 3 (FeeAMM pools mapping)
	// poolId = keccak256(abi.encode(userToken, validatorToken))
	for (const userToken of tokenCandidates) {
		for (const validatorToken of tokenCandidates) {
			if (userToken === validatorToken) continue

			// Compute poolId
			const poolId = Hash.keccak256(
				Hex.concat(
					Hex.padLeft(userToken.toLowerCase() as Hex.Hex, 32),
					Hex.padLeft(validatorToken.toLowerCase() as Hex.Hex, 32),
				),
			)

			// Compute storage slot for pools[poolId] at base slot 3
			const slot = Hash.keccak256(
				Hex.concat(poolId, Hex.padLeft(Hex.fromNumber(3), 32)),
			)

			if (slot.toLowerCase() === slotLower) {
				const userMeta =
					allTokenMetadata?.[userToken.toLowerCase()] ??
					(userToken.toLowerCase() === PATH_USD_ADDRESS
						? PATH_USD_META
						: undefined)
				const validatorMeta =
					allTokenMetadata?.[validatorToken.toLowerCase()] ??
					(validatorToken.toLowerCase() === PATH_USD_ADDRESS
						? PATH_USD_META
						: undefined)
				const userLabel = userMeta?.symbol ?? formatAddress(userToken)
				const validatorLabel =
					validatorMeta?.symbol ?? formatAddress(validatorToken)

				// Decode packed Pool struct (uint128 reserveUserToken, uint128 reserveValidatorToken)
				const decoded = decodePackedPoolReserves(
					change.before,
					change.after,
					userMeta?.decimals,
					validatorMeta?.decimals,
					userLabel,
					validatorLabel,
				)

				return {
					slotLabel: `pool[${userLabel}→${validatorLabel}]`,
					slotRaw: change.slot,
					beforeDisplay: decoded.beforeDisplay,
					afterDisplay: decoded.afterDisplay,
					beforeRaw: change.before,
					afterRaw: change.after,
					kind: 'balance',
					diff: decoded.diff,
				}
			}
		}
	}

	return null
}

function decodePackedPoolReserves(
	before: Hex.Hex,
	after: Hex.Hex,
	userDecimals?: number,
	validatorDecimals?: number,
	userSymbol?: string,
	validatorSymbol?: string,
): {
	beforeDisplay: string
	afterDisplay: string
	diff?: { display: string; isPositive: boolean }
} {
	// Pool struct packs two uint128 values:
	// Lower 128 bits: reserveUserToken
	// Upper 128 bits: reserveValidatorToken
	const beforeBig = Hex.toBigInt(before)
	const afterBig = Hex.toBigInt(after)

	const mask128 = (1n << 128n) - 1n
	const beforeUserReserve = beforeBig & mask128
	const beforeValidatorReserve = beforeBig >> 128n
	const afterUserReserve = afterBig & mask128
	const afterValidatorReserve = afterBig >> 128n

	const formatReserve = (
		value: bigint,
		decimals?: number,
		symbol?: string,
	): string => {
		if (decimals !== undefined) {
			const formatted = Value.format(value, decimals)
			const num = Number(formatted)
			const display = new Intl.NumberFormat('en-US', {
				maximumFractionDigits: 6,
				minimumFractionDigits: 0,
			}).format(num)
			return symbol ? `${display} ${symbol}` : display
		}
		return value.toLocaleString('en-US')
	}

	const beforeDisplay = `${formatReserve(beforeUserReserve, userDecimals, userSymbol)} / ${formatReserve(beforeValidatorReserve, validatorDecimals, validatorSymbol)}`
	const afterDisplay = `${formatReserve(afterUserReserve, userDecimals, userSymbol)} / ${formatReserve(afterValidatorReserve, validatorDecimals, validatorSymbol)}`

	// Compute diff for both reserves
	const userDiff = afterUserReserve - beforeUserReserve
	const validatorDiff = afterValidatorReserve - beforeValidatorReserve

	let diff: { display: string; isPositive: boolean } | undefined
	if (userDiff !== 0n || validatorDiff !== 0n) {
		const formatDiff = (
			value: bigint,
			decimals?: number,
			symbol?: string,
		): string => {
			const isPos = value > 0n
			const abs = isPos ? value : -value
			const prefix = isPos ? '+' : '-'
			if (decimals !== undefined) {
				const formatted = Value.format(abs, decimals)
				const num = Number(formatted)
				const display = new Intl.NumberFormat('en-US', {
					maximumFractionDigits: 6,
					minimumFractionDigits: 0,
				}).format(num)
				return symbol ? `${prefix}${display} ${symbol}` : `${prefix}${display}`
			}
			return `${prefix}${abs.toLocaleString('en-US')}`
		}

		const parts: string[] = []
		if (userDiff !== 0n) {
			parts.push(formatDiff(userDiff, userDecimals, userSymbol))
		}
		if (validatorDiff !== 0n) {
			parts.push(formatDiff(validatorDiff, validatorDecimals, validatorSymbol))
		}

		diff = {
			display: parts.join(' / '),
			// Show green if net positive, red if net negative
			isPositive: userDiff + validatorDiff >= 0n,
		}
	}

	return { beforeDisplay, afterDisplay, diff }
}

function decodeGenericValue(
	change: StorageChange,
): DecodedStorageChange | null {
	const beforeAddr = tryDecodeAsAddress(change.before)
	const afterAddr = tryDecodeAsAddress(change.after)

	if (beforeAddr || afterAddr) {
		return {
			slotLabel: change.slot,
			slotRaw: change.slot,
			beforeDisplay: beforeAddr ?? formatHexValue(change.before),
			afterDisplay: afterAddr ?? formatHexValue(change.after),
			beforeRaw: change.before,
			afterRaw: change.after,
			kind: 'address',
		}
	}

	const beforeBig = Hex.toBigInt(change.before)
	const afterBig = Hex.toBigInt(change.after)

	const isSmallNumber = beforeBig < 10n ** 30n && afterBig < 10n ** 30n
	if (isSmallNumber && (beforeBig > 0n || afterBig > 0n)) {
		return {
			slotLabel: change.slot,
			slotRaw: change.slot,
			beforeDisplay: beforeBig.toLocaleString('en-US'),
			afterDisplay: afterBig.toLocaleString('en-US'),
			beforeRaw: change.before,
			afterRaw: change.after,
			kind: 'uint256',
		}
	}

	return null
}

function formatHexValue(value: Hex.Hex): string {
	const bigVal = Hex.toBigInt(value)
	if (bigVal === 0n) return '0'
	return value
}

export function extractCandidateAddresses(
	trace: {
		from: Hex.Hex
		to?: Hex.Hex
		calls?: Array<{ from: Hex.Hex; to?: Hex.Hex; calls?: unknown[] }>
	} | null,
	receipt: { from: Hex.Hex; to: Hex.Hex | null },
	logs?: Array<{ address: Hex.Hex; topics?: Hex.Hex[] }>,
): Hex.Hex[] {
	const addresses = new Set<string>()

	addresses.add(receipt.from.toLowerCase())
	if (receipt.to) addresses.add(receipt.to.toLowerCase())

	if (trace) {
		addresses.add(trace.from.toLowerCase())
		if (trace.to) addresses.add(trace.to.toLowerCase())

		function walkCalls(
			calls?: Array<{ from: Hex.Hex; to?: Hex.Hex; calls?: unknown[] }>,
		) {
			if (!calls) return
			for (const call of calls) {
				addresses.add(call.from.toLowerCase())
				if (call.to) addresses.add(call.to.toLowerCase())
				if (call.calls)
					walkCalls(
						call.calls as Array<{
							from: Hex.Hex
							to?: Hex.Hex
							calls?: unknown[]
						}>,
					)
			}
		}
		walkCalls(trace.calls)
	}

	if (logs) {
		for (const log of logs) {
			addresses.add(log.address.toLowerCase())
			if (log.topics) {
				for (const topic of log.topics) {
					if (isAddressLike(topic)) {
						const addr = extractAddress(topic)
						if (Hex.toBigInt(addr) !== 0n) {
							addresses.add(addr.toLowerCase())
						}
					}
				}
			}
		}
	}

	return Array.from(addresses).filter(
		(a) => a !== '0x0000000000000000000000000000000000000000',
	) as Hex.Hex[]
}
