import { whatsabi } from '@shazow/whatsabi'
import type { Address, Hex } from 'ox'
import { Abis, Addresses } from 'tempo.ts/viem'
import type { Abi, AbiFunction, AbiParameter } from 'viem'
import { toFunctionSelector } from 'viem'
import { getPublicClient } from 'wagmi/actions'
import { isTip20Address } from '#lib/domain/tip20.ts'
import { config } from '#wagmi.config.ts'

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
	category: 'token' | 'system' | 'utility' | 'account'
	/** External documentation link */
	docsUrl?: string
	address: Address.Address
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
		Addresses.stablecoinExchange,
		{
			name: 'Stablecoin Exchange',
			code: '0xef',
			description: 'Enshrined DEX for stablecoin swaps',
			abi: Abis.stablecoinExchange,
			category: 'system',
			docsUrl: 'https://docs.tempo.xyz/documentation/protocol/exchange',
			address: Addresses.stablecoinExchange,
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

	// Account Abstraction
	[
		Addresses.accountImplementation,
		{
			name: 'IthacaAccount',
			code: '0xef',
			description: 'Reference account implementation',
			abi: Abis.tipAccountRegistrar,
			category: 'account',
			address: Addresses.accountImplementation,
		},
	],
])

/**
 * Known contract registry mapping addresses to their metadata and ABIs.
 */
export const contractRegistry = new Map<Address.Address, ContractInfo>(<const>[
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
 * Get contract info by address (case-insensitive)
 * Also handles TIP-20 tokens that aren't explicitly registered
 */
export function getContractInfo(
	address: Address.Address,
): ContractInfo | undefined {
	const registered = contractRegistry.get(
		address.toLowerCase() as Address.Address,
	)
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

/**
 * Check if an address is a known contract (includes TIP-20 tokens)
 */
export function isKnownContract(address: Address.Address): boolean {
	return (
		contractRegistry.has(address.toLowerCase() as Address.Address) ||
		isTip20Address(address)
	)
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
 * Also filters out malformed entries (missing inputs array).
 */
export function getWriteFunctions(abi: Abi): WriteFunction[] {
	const functions = abi.filter(
		(item): item is WriteFunction =>
			item.type === 'function' &&
			(item.stateMutability === 'nonpayable' ||
				item.stateMutability === 'payable') &&
			Array.isArray(item.inputs),
	)

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
	const client = getPublicClient(config)
	const code = await client.getCode({ address })
	if (!code || code === '0x') return undefined
	return code
}

// ============================================================================
// Whatsabi - ABI extraction from bytecode
// ============================================================================

/**
 * Attempts to extract an ABI from contract bytecode using whatsabi.autoload.
 * Returns undefined if the address has no code or extraction fails.
 */
export async function extractContractAbi(
	address: Address.Address,
): Promise<Abi | undefined> {
	try {
		const client = getPublicClient(config)

		const result = await whatsabi.autoload(address, {
			provider: client,
			followProxies: true,
			// Disable ABI loader (requires Etherscan API key)
			abiLoader: false,
			signatureLookup: new whatsabi.loaders.MultiSignatureLookup([
				new whatsabi.loaders.OpenChainSignatureLookup(),
				new whatsabi.loaders.SamczunSignatureLookup(),
			]),
		})

		if (!result.abi || result.abi.length === 0) return undefined

		return result.abi as Abi
	} catch (error) {
		console.error('Failed to extract ABI:', error)
		return undefined
	}
}
