import { loaders, whatsabi } from '@shazow/whatsabi'
import type { Address, Hex } from 'ox'
import type { Abi, AbiEvent, AbiFunction, AbiParameter } from 'viem'
import {
	decodeEventLog,
	getAbiItem as getAbiItem_viem,
	stringify,
	toFunctionSelector,
} from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import { getChainId, getPublicClient } from 'wagmi/actions'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { getWagmiConfig } from '#wagmi.config.ts'

/**
 * Registry of known contract addresses to their ABIs and metadata.
 * This enables the explorer to render contract interfaces for any precompile.
 */

export type ContractInfo = {
	name: string
	description?: string
	code: Hex.Hex
	abi: Abi
	/** Category for grouping in UI */
	category: 'token' | 'system' | 'utility' | 'account' | 'precompile'
	/** External documentation link */
	docsUrl?: string
	address: Address.Address
}

function makePrecompile(
	data: Omit<ContractInfo, 'code' | 'abi' | 'category'>,
): [Address.Address, ContractInfo] {
	return [
		data.address,
		{ ...data, code: '0x' as Hex.Hex, abi: [] as Abi, category: 'precompile' },
	]
}

/**
 * Ethereum precompile addresses with their metadata.
 * Precompiles don't use standard ABI encoding - decoding is handled separately.
 */
export const precompileRegistry = new Map<Address.Address, ContractInfo>([
	makePrecompile({
		address: '0x0000000000000000000000000000000000000001',
		name: 'ecRecover',
		description: 'Elliptic curve digital signature recovery',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x01',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000002',
		name: 'sha256',
		description: 'SHA-256 hash function',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x02',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000003',
		name: 'ripemd160',
		description: 'RIPEMD-160 hash function',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x03',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000004',
		name: 'identity',
		description: 'Identity (data copy) function',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x04',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000005',
		name: 'modexp',
		description: 'Modular exponentiation',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x05',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000006',
		name: 'ecAdd',
		description: 'Point addition on elliptic curve alt_bn128',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x06',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000007',
		name: 'ecMul',
		description: 'Scalar multiplication on elliptic curve alt_bn128',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x07',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000008',
		name: 'ecPairing',
		description: 'Bilinear function on groups on elliptic curve alt_bn128',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x08',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000009',
		name: 'blake2f',
		description: 'BLAKE2 compression function F',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x09',
	}),
	makePrecompile({
		address: '0x000000000000000000000000000000000000000a',
		name: 'pointEvaluation',
		description: 'KZG point evaluation for EIP-4844 blob verification',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x0a',
	}),
	// Prague BLS12-381 precompiles (EIP-2537).
	makePrecompile({
		address: '0x000000000000000000000000000000000000000b',
		name: 'bls12G1Add',
		description: 'BLS12-381 G1 point addition',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x0b',
	}),
	makePrecompile({
		address: '0x000000000000000000000000000000000000000c',
		name: 'bls12G1Msm',
		description: 'BLS12-381 G1 multi-scalar multiplication',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x0c',
	}),
	makePrecompile({
		address: '0x000000000000000000000000000000000000000d',
		name: 'bls12G2Add',
		description: 'BLS12-381 G2 point addition',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x0d',
	}),
	makePrecompile({
		address: '0x000000000000000000000000000000000000000e',
		name: 'bls12G2Msm',
		description: 'BLS12-381 G2 multi-scalar multiplication',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x0e',
	}),
	makePrecompile({
		address: '0x000000000000000000000000000000000000000f',
		name: 'bls12PairingCheck',
		description: 'BLS12-381 pairing check',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x0f',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000010',
		name: 'bls12MapFpToG1',
		description: 'BLS12-381 map field element to G1 point',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x10',
	}),
	makePrecompile({
		address: '0x0000000000000000000000000000000000000011',
		name: 'bls12MapFp2ToG2',
		description: 'BLS12-381 map Fp2 element to G2 point',
		docsUrl: 'https://www.evm.codes/precompiled?fork=osaka#0x11',
	}),
	// P256 ECDSA verification (RIP-7212).
	makePrecompile({
		address: '0x0000000000000000000000000000000000000100',
		name: 'p256Verify',
		description: 'ECDSA signature verification on secp256r1 (P-256)',
		docsUrl: 'https://www.evm.codes/precompiled#0x100',
	}),
])

/**
 * Check if an address is an Ethereum precompile.
 */
export function isPrecompile(address: Address.Address): boolean {
	return precompileRegistry.has(address.toLowerCase() as Address.Address)
}

/**
 * Known TIP-20 Token contracts registry mapping addresses to their metadata and ABIs.
 */
export const tip20ContractRegistry = new Map<Address.Address, ContractInfo>(<
	const
>[
	// TIP-20 Tokens
	[
		'0x20c0000000000000000000000000000000000000',
		{
			name: 'pathUSD',
			description: 'Non-transferable DEX accounting unit',
			abi: Abis.tip20,
			code: '0xef',
			category: 'token',
			docsUrl: 'https://docs.tempo.xyz/documentation/protocol/exchange/pathUSD',
			address: '0x20c0000000000000000000000000000000000000',
		},
	],
	[
		'0x20c0000000000000000000000000000000000001',
		{
			name: 'AlphaUSD',
			code: '0xef',
			description: 'TIP-20 stablecoin (AUSD)',
			abi: Abis.tip20,
			category: 'token',
			address: '0x20c0000000000000000000000000000000000001',
		},
	],
	[
		'0x20c0000000000000000000000000000000000002',
		{
			name: 'BetaUSD',
			code: '0xef',
			description: 'TIP-20 stablecoin (BUSD)',
			abi: Abis.tip20,
			category: 'token',
			address: '0x20c0000000000000000000000000000000000002',
		},
	],
	[
		'0x20c0000000000000000000000000000000000003',
		{
			name: 'ThetaUSD',
			code: '0xef',
			description: 'TIP-20 stablecoin (TUSD)',
			abi: Abis.tip20,
			category: 'token',
			address: '0x20c0000000000000000000000000000000000003',
		},
	],
])

/**
 * Known System contracts registry mapping addresses to their metadata and ABIs.
 */
export const systemContractRegistry = new Map<Address.Address, ContractInfo>(<
	const
>[
	// System Contracts
	[
		Addresses.tip20Factory,
		{
			name: 'TIP-20 Factory',
			code: '0xef',
			description: 'Create new TIP-20 tokens',
			abi: Abis.tip20Factory,
			category: 'system',
			docsUrl: 'https://docs.tempo.xyz/documentation/protocol/tip20/overview',
			address: Addresses.tip20Factory,
		},
	],
	[
		// 0xfeec000000000000000000000000000000000000
		Addresses.feeManager,
		{
			name: 'Fee Manager',
			code: '0xef',
			description: 'Handle fee payments and conversions',
			abi: Abis.feeManager,
			category: 'system',
			docsUrl:
				'https://docs.tempo.xyz/documentation/protocol/fees/spec-fee-amm#2-feemanager-contract',
			address: Addresses.feeManager,
		},
	],
	[
		Addresses.stablecoinDex,
		{
			name: 'Stablecoin Exchange',
			code: '0xef',
			description: 'Enshrined DEX for stablecoin swaps',
			abi: Abis.stablecoinDex,
			category: 'system',
			docsUrl: 'https://docs.tempo.xyz/documentation/protocol/exchange',
			address: Addresses.stablecoinDex,
		},
	],
	[
		Addresses.tip403Registry,
		{
			name: 'TIP-403 Registry',
			code: '0xef',
			description: 'Transfer policy registry',
			abi: Abis.tip403Registry,
			category: 'system',
			docsUrl: 'https://docs.tempo.xyz/documentation/protocol/tip403/spec',
			address: Addresses.tip403Registry,
		},
	],
	[
		'0xcccccccc00000000000000000000000000000000',
		{
			name: 'Validator Config',
			code: '0xef',
			description: 'Manage validator set and configuration',
			abi: Abis.validatorConfig,
			category: 'system',
			address: '0xcccccccc00000000000000000000000000000000',
		},
	],
	[
		Addresses.nonceManager,
		{
			name: 'Nonce Manager',
			code: '0xef',
			description: 'Manage account nonces',
			abi: [],
			category: 'system',
			address: Addresses.nonceManager,
		},
	],
])

/**
 * Known contract registry mapping addresses to their metadata and ABIs.
 */
export const contractRegistry = new Map<Address.Address, ContractInfo>(<const>[
	...precompileRegistry.entries(),
	...systemContractRegistry.entries(),
	...tip20ContractRegistry.entries(),
])

/**
 * detect if an address is a system address (i.e., not a token)
 */
export function systemAddress(address: Address.Address): boolean {
	return systemContractRegistry.has(address.toLowerCase() as Address.Address)
}

/**
 * Get contract info by address (case-insensitive).
 * Also handles TIP-20 tokens that aren't explicitly registered.
 */
export function getContractInfo(
	address: Address.Address,
): ContractInfo | undefined {
	const lowerAddress = address.toLowerCase() as Address.Address
	const registered = contractRegistry.get(lowerAddress)
	if (registered) return registered

	// Dynamic TIP-20 token detection
	if (isTip20Address(address))
		return {
			address,
			name: 'TIP-20 Token',
			code: '0xef',
			description: 'TIP-20 compatible token',
			abi: Abis.tip20,
			category: 'token',
		}

	return undefined
}

/**
 * Get the ABI for a contract address
 */
export function getContractAbi(address: Address.Address): Abi | undefined {
	return getContractInfo(address)?.abi
}

// ============================================================================
// ABI Utilities
// ============================================================================

export type ReadFunction = AbiFunction & { stateMutability: 'view' | 'pure' }
export type WriteFunction = AbiFunction & {
	stateMutability: 'nonpayable' | 'payable'
}

/**
 * Whatsabi adds a `selector` property to ABI items with the actual selector from bytecode.
 * This is needed because whatsabi doesn't always recover the function name.
 */
type WhatsabiAbiFunction = AbiFunction & { selector?: string }

/**
 * Get the function selector, using whatsabi's extracted selector if available,
 * otherwise computing it from the function signature.
 */
export function getFunctionSelector(fn: AbiFunction): string {
	const whatsabiFn = fn as WhatsabiAbiFunction
	if (whatsabiFn.selector) return whatsabiFn.selector
	// Only compute if we have a name (otherwise toFunctionSelector gives wrong result)
	if (fn.name) return toFunctionSelector(fn)
	// Fallback - shouldn't happen for valid ABIs
	return '0x00000000'
}

/**
 * Common read function name patterns.
 * Used to include functions that are likely read-only even if marked as 'nonpayable'.
 */
const READ_FUNCTION_PATTERNS = [
	/^get[A-Z_]/i,
	/^is[A-Z_]/i,
	/^has[A-Z_]/i,
	/^can[A-Z_]/i,
	/^check[A-Z_]/i,
	/^query[A-Z_]/i,
	/^fetch[A-Z_]/i,
	/^read[A-Z_]/i,
	/^view[A-Z_]/i,
	/^calculate[A-Z_]/i,
	/^compute[A-Z_]/i,
	/^estimate[A-Z_]/i,
	/^predict[A-Z_]/i,
	/^current[A-Z_]/i,
	/^total[A-Z_]/i,
	/^balance/i,
	/^allowance/i,
	/^owner/i,
	/^name$/i,
	/^symbol$/i,
	/^decimals$/i,
	/^version$/i,
	/^nonce/i,
	/^supply/i,
	/^length$/i,
	/^count$/i,
	/^size$/i,
	/^index$/i,
]

/**
 * Common write function name patterns.
 * Used to filter out functions that whatsabi incorrectly marked as 'view'.
 */
const WRITE_FUNCTION_PATTERNS = [
	/^transfer/i,
	/^approve/i,
	/^set[A-Z_]/i,
	/^mint/i,
	/^burn/i,
	/^withdraw/i,
	/^deposit/i,
	/^send/i,
	/^swap/i,
	/^add[A-Z_]/i,
	/^remove[A-Z_]/i,
	/^update/i,
	/^execute/i,
	/^submit/i,
	/^claim/i,
	/^stake/i,
	/^unstake/i,
	/^lock/i,
	/^unlock/i,
	/^pause/i,
	/^unpause/i,
	/^revoke/i,
	/^grant/i,
	/^renounce/i,
	/^initialize/i,
	/^create/i,
	/^delete/i,
	/^cancel/i,
	/^close/i,
	/^open/i,
	/^enable/i,
	/^disable/i,
]

/**
 * Check if a function name looks like a read function.
 * Used for whatsabi-extracted functions where stateMutability might be incorrect.
 */
function looksLikeReadFunction(name: string | undefined): boolean {
	if (!name) return false
	return READ_FUNCTION_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * Check if a function name looks like a write function.
 * Used for whatsabi-extracted functions where stateMutability might be incorrect.
 */
function looksLikeWriteFunction(name: string | undefined): boolean {
	if (!name) return false
	return WRITE_FUNCTION_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * Extract read-only functions from an ABI, deduplicated by selector.
 * - For standard ABIs: returns view/pure functions with outputs
 * - For whatsabi ABIs: uses name heuristics since stateMutability is often incorrect
 */
export function getReadFunctions(abi: Abi): ReadFunction[] {
	const functions = abi.filter((item): item is ReadFunction => {
		if (item.type !== 'function') return false
		if (!Array.isArray(item.inputs)) return false

		const whatsabiItem = item as WhatsabiAbiFunction
		const isWhatsabi = Boolean(whatsabiItem.selector)

		// For standard ABIs, use stateMutability and require outputs
		if (!isWhatsabi) {
			if (!Array.isArray(item.outputs) || item.outputs.length === 0)
				return false
			return item.stateMutability === 'view' || item.stateMutability === 'pure'
		}

		// For whatsabi ABIs, stateMutability is often wrong (everything is nonpayable)
		// Use name-based heuristics instead
		if (looksLikeWriteFunction(item.name)) return false
		if (looksLikeReadFunction(item.name)) return true

		// Functions with no inputs that don't look like writes are likely getters
		// (e.g., typeAndVersion(), owner(), MAX_RET_BYTES(), etc.)
		if (item.inputs.length === 0) return true

		// Default: only include if explicitly view/pure
		return item.stateMutability === 'view' || item.stateMutability === 'pure'
	})

	// Deduplicate by selector (whatsabi can return duplicates)
	const seen = new Set<string>()
	return functions.filter((fn) => {
		const selector = getFunctionSelector(fn)
		if (seen.has(selector)) return false
		seen.add(selector)
		return true
	})
}

/**
 * Extract write functions (nonpayable/payable) from an ABI, deduplicated by selector.
 * Also filters out malformed entries (missing inputs array) and read-looking functions
 * that whatsabi incorrectly marked as nonpayable.
 */
export function getWriteFunctions(abi: Abi): WriteFunction[] {
	const functions = abi.filter((item): item is WriteFunction => {
		if (item.type !== 'function') return false
		if (!Array.isArray(item.inputs)) return false

		const isNonpayableOrPayable =
			item.stateMutability === 'nonpayable' ||
			item.stateMutability === 'payable'
		if (!isNonpayableOrPayable) return false

		const whatsabiItem = item as WhatsabiAbiFunction
		const isWhatsabi = Boolean(whatsabiItem.selector)

		// For whatsabi ABIs, filter out functions that look like read functions
		if (isWhatsabi) {
			if (looksLikeReadFunction(item.name)) return false
			// Functions with no inputs that don't look like writes are likely getters
			if (item.inputs.length === 0 && !looksLikeWriteFunction(item.name))
				return false
		}

		return true
	})

	// Deduplicate by selector
	const seen = new Set<string>()
	return functions.filter((fn) => {
		const selector = getFunctionSelector(fn)
		if (seen.has(selector)) return false
		seen.add(selector)
		return true
	})
}

/**
 * Get functions without inputs (can be displayed as static values)
 */
export function getNoInputFunctions(abi: Abi): ReadFunction[] {
	return getReadFunctions(abi).filter((fn) => fn?.inputs?.length === 0)
}

/**
 * Get functions with inputs (require user input)
 */
export function getInputFunctions(abi: Abi): ReadFunction[] {
	return getReadFunctions(abi).filter((fn) => fn?.inputs?.length > 0)
}

// ============================================================================
// Parameter Type Utilities
// ============================================================================

export type SolidityBaseType =
	| 'address'
	| 'bool'
	| 'string'
	| 'bytes'
	| 'uint'
	| 'int'
	| 'tuple'

/**
 * Get the base type from a Solidity type string
 * e.g., "uint256" -> "uint", "address[]" -> "address"
 */
export function getBaseType(type: string): SolidityBaseType {
	const cleaned = type.replace(/\[\d*\]$/, '') // Remove array suffix
	if (cleaned.startsWith('uint')) return 'uint'
	if (cleaned.startsWith('int')) return 'int'
	if (cleaned.startsWith('bytes') && cleaned !== 'bytes') return 'bytes'
	return cleaned as SolidityBaseType
}

/**
 * Check if a type is an array type
 */
export function isArrayType(type: string): boolean {
	return type.endsWith('[]') || /\[\d+\]$/.test(type)
}

/**
 * Get placeholder text for an input type
 */
export function getPlaceholder(param: AbiParameter): string {
	const { type, name } = param
	const baseType = getBaseType(type)

	switch (baseType) {
		case 'address':
			return '0x…'
		case 'bool':
			return 'true or false'
		case 'string':
			return name || 'Enter text…'
		case 'bytes':
			return '0x…'
		case 'uint':
		case 'int':
			return '0'
		case 'tuple':
			return 'JSON object'
		default:
			return name || type
	}
}

/**
 * Get input type for HTML input element
 */
export function getInputType(
	type: string,
): 'text' | 'number' | 'checkbox' | 'textarea' {
	const baseType = getBaseType(type)
	if (baseType === 'bool') return 'checkbox'
	if (baseType === 'uint' || baseType === 'int') return 'text' // Use text for big numbers
	if (baseType === 'tuple' || isArrayType(type)) return 'textarea'
	return 'text'
}

/**
 * Parse user input to the correct type for contract call
 */
export function parseInputValue(value: string, type: string): unknown {
	const trimmed = value.trim()
	const baseType = getBaseType(type)

	if (isArrayType(type)) {
		try {
			return JSON.parse(trimmed)
		} catch {
			return trimmed.split(',').map((v) => v.trim())
		}
	}

	switch (baseType) {
		case 'bool':
			return trimmed === 'true' || trimmed === '1'
		case 'uint':
		case 'int':
			return BigInt(trimmed)
		case 'tuple':
			return JSON.parse(trimmed)
		default:
			return trimmed
	}
}

/**
 * Format output value for display
 */
export function formatOutputValue(value: unknown, _type: string): string {
	if (value === undefined || value === null) return '—'

	if (typeof value === 'bigint') return value.toString()

	if (typeof value === 'boolean') return value ? 'true' : 'false'

	if (Array.isArray(value) || typeof value === 'object')
		return JSON.stringify(value, (_, v) =>
			typeof v === 'bigint' ? v.toString() : v,
		)

	return String(value)
}

/**
 * Get the bytecode for a contract address
 */
export async function getContractBytecode(
	address: Address.Address,
): Promise<Hex.Hex | undefined> {
	const config = getWagmiConfig()
	const client = getPublicClient(config)
	const code = await client.getCode({ address })
	if (!code || code === '0x') return undefined
	return code
}

// ============================================================================
// ABI Item Utilities
// ============================================================================

/**
 * Get an ABI item by selector (function selector or event topic)
 */
export function getAbiItem({
	abi,
	selector,
}: {
	abi: Abi
	selector: Hex.Hex
}): AbiFunction | undefined {
	const abiItem =
		(getAbiItem_viem({
			abi: abi.map((x) => ({
				...x,
				inputs: (x as AbiFunction).inputs || [],
				outputs: (x as AbiFunction).outputs || [],
			})),
			name: selector,
		}) as AbiFunction) ||
		abi.find((x) => (x as AbiFunction).name === selector) ||
		abi.find((x) => (x as { selector?: string }).selector === selector)

	if (!abiItem) return

	return {
		...abiItem,
		outputs: abiItem.outputs || [],
		inputs: abiItem.inputs || [],
		name: abiItem.name || (abiItem as { selector?: string }).selector || '',
	} as AbiFunction
}

/**
 * Format an ABI value for display
 */
export function formatAbiValue(value: unknown): string {
	if (typeof value === 'bigint') {
		return value.toString()
	}
	if (Array.isArray(value)) {
		return `[${value.map(formatAbiValue).join(', ')}]`
	}
	if (typeof value === 'object' && value !== null) {
		return stringify(value)
	}
	return String(value ?? '')
}

/**
 * Decode event log with guessed indexed parameters.
 * Useful when the ABI doesn't correctly specify which parameters are indexed.
 * @see https://github.com/paradigmxyz/rivet/blob/fd94089ba4bec65bbf3fa288efbeab7306cb1537/src/utils/abi.ts#L13
 */
export function decodeEventLog_guessed(args: {
	abiItem: AbiEvent
	data: Hex.Hex
	topics: readonly Hex.Hex[]
}) {
	const { abiItem, data, topics } = args
	const indexedValues = topics.slice(1)

	for (let i = 0; i < indexedValues.length; i++) {
		const offset = indexedValues.length - i
		for (
			let j = 0;
			j < abiItem.inputs.length - indexedValues.length + 1 - i;
			j++
		) {
			const inputs = abiItem.inputs.map((input, index) => ({
				...input,
				indexed:
					index < offset - 1 ||
					index === i + j + offset - 1 ||
					index >= abiItem.inputs.length - (indexedValues.length - offset),
			}))
			const abi = [{ ...abiItem, inputs }]
			try {
				return decodeEventLog({
					abi,
					topics: topics as [Hex.Hex, ...Hex.Hex[]],
					data,
				})
			} catch {}
		}
	}
}

// ============================================================================
// Whatsabi - ABI extraction from bytecode
// ============================================================================

const defaultSignatureLookup = new loaders.MultiSignatureLookup([
	new loaders.OpenChainSignatureLookup(),
	new loaders.FourByteSignatureLookup(),
	new loaders.SamczunSignatureLookup(),
])

/**
 * Lookup a function or event signature by selector/topic hash.
 * Returns the first matching signature string or null.
 */
export async function lookupSignature(
	selector: Hex.Hex,
): Promise<string | null> {
	const signatures =
		selector.length === 10
			? await defaultSignatureLookup.loadFunctions(selector)
			: await defaultSignatureLookup.loadEvents(selector)
	return signatures[0] ?? null
}

export type AutoloadAbiOptions = {
	followProxies?: boolean
	includeSourceVerified?: boolean
}

/**
 * Autoload ABI for a contract address using whatsabi.
 * Attempts to fetch verified source from Sourcify, falls back to bytecode extraction.
 */
export async function autoloadAbi(
	address: Address.Address,
	options: AutoloadAbiOptions = {},
): Promise<Abi | null> {
	const { followProxies = true, includeSourceVerified = true } = options
	const config = getWagmiConfig()
	const chainId = getChainId(config)
	const client = getPublicClient(config)

	try {
		const result = await whatsabi.autoload(address, {
			provider: client,
			followProxies,
			abiLoader: includeSourceVerified
				? new loaders.MultiABILoader([
						new loaders.SourcifyABILoader({ chainId }),
					])
				: false,
			signatureLookup: defaultSignatureLookup,
			onError: () => false,
		})

		if (!result.abi || result.abi.length === 0) return null

		const hasNames = result.abi.some((item) => (item as { name?: string }).name)
		if (!hasNames) return null

		return result.abi.map((abiItem) => ({
			...abiItem,
			inputs: ('inputs' in abiItem && abiItem.inputs) || [],
			outputs: ('outputs' in abiItem && abiItem.outputs) || [],
		})) as Abi
	} catch {
		return null
	}
}

/**
 * Extract ABI from bytecode only (no source verification).
 * Use this when you specifically want bytecode-extracted ABI.
 */
export async function extractContractAbi(
	address: Address.Address,
): Promise<Abi | undefined> {
	const result = await autoloadAbi(address, { includeSourceVerified: false })
	return result ?? undefined
}
