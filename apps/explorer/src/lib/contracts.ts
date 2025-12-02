import type { Address } from 'ox'
import { Abis, Addresses } from 'tempo.ts/viem'
import type { Abi, AbiFunction, AbiParameter } from 'viem'

/**
 * Registry of known contract addresses to their ABIs and metadata.
 * This enables the explorer to render contract interfaces for any precompile.
 */

export type ContractInfo = {
	name: string
	description?: string
	abi: Abi
	/** Category for grouping in UI */
	category: 'token' | 'system' | 'utility' | 'account'
	/** External documentation link */
	docsUrl?: string
}

/**
 * Known contract registry mapping addresses to their metadata and ABIs.
 */
export const contractRegistry = new Map<Address.Address, ContractInfo>(<const>[
	// TIP-20 Tokens
	[
		'0x20c0000000000000000000000000000000000000',
		{
			name: 'linkingUSD',
			description: 'Non-transferable DEX accounting unit',
			abi: Abis.tip20,
			category: 'token',
			docsUrl:
				'https://docs.tempo.xyz/documentation/protocol/exchange/linkingUSD',
		},
	],
	[
		'0x20c0000000000000000000000000000000000001',
		{
			name: 'AlphaUSD',
			description: 'TIP-20 stablecoin (AUSD)',
			abi: Abis.tip20,
			category: 'token',
		},
	],
	[
		'0x20c0000000000000000000000000000000000002',
		{
			name: 'BetaUSD',
			description: 'TIP-20 stablecoin (BUSD)',
			abi: Abis.tip20,
			category: 'token',
		},
	],
	[
		'0x20c0000000000000000000000000000000000003',
		{
			name: 'ThetaUSD',
			description: 'TIP-20 stablecoin (TUSD)',
			abi: Abis.tip20,
			category: 'token',
		},
	],

	// System Contracts
	[
		Addresses.tip20Factory,
		{
			name: 'TIP-20 Factory',
			description: 'Create new TIP-20 tokens',
			abi: Abis.tip20Factory,
			category: 'system',
			docsUrl: 'https://docs.tempo.xyz/documentation/protocol/tip20/overview',
		},
	],
	[
		Addresses.feeManager,
		{
			name: 'Fee Manager',
			description: 'Handle fee payments and conversions',
			abi: Abis.feeManager,
			category: 'system',
			docsUrl:
				'https://docs.tempo.xyz/documentation/protocol/fees/spec-fee-amm#2-feemanager-contract',
		},
	],
	[
		Addresses.stablecoinExchange,
		{
			name: 'Stablecoin Exchange',
			description: 'Enshrined DEX for stablecoin swaps',
			abi: Abis.stablecoinExchange,
			category: 'system',
			docsUrl: 'https://docs.tempo.xyz/documentation/protocol/exchange',
		},
	],
	[
		Addresses.tip403Registry,
		{
			name: 'TIP-403 Registry',
			description: 'Transfer policy registry',
			abi: Abis.tip403Registry,
			category: 'system',
			docsUrl: 'https://docs.tempo.xyz/documentation/protocol/tip403/spec',
		},
	],

	// Account Abstraction
	[
		Addresses.accountImplementation,
		{
			name: 'IthacaAccount',
			description: 'Reference account implementation',
			abi: Abis.tipAccountRegistrar,
			category: 'account',
		},
	],
])

/**
 * Detect TIP-20 addresses
 */
const TIP20_PREFIX = '0x20c000000'
export type Tip20Address = `${typeof TIP20_PREFIX}${string}`
export function isTip20Address(address: string): address is Tip20Address {
	return address.toLowerCase().startsWith(TIP20_PREFIX)
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
	if (isTip20Address(address)) {
		return {
			name: 'TIP-20 Token',
			description: 'TIP-20 compatible token',
			abi: Abis.tip20,
			category: 'token',
		}
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
 * Extract read-only functions (view/pure) from an ABI
 */
export function getReadFunctions(abi: Abi): ReadFunction[] {
	return abi.filter(
		(item): item is ReadFunction =>
			item.type === 'function' &&
			(item.stateMutability === 'view' || item.stateMutability === 'pure'),
	)
}

/**
 * Extract write functions (nonpayable/payable) from an ABI
 */
export function getWriteFunctions(abi: Abi): WriteFunction[] {
	return abi.filter(
		(item): item is WriteFunction =>
			item.type === 'function' &&
			(item.stateMutability === 'nonpayable' ||
				item.stateMutability === 'payable'),
	)
}

/**
 * Get functions without inputs (can be displayed as static values)
 */
export function getNoInputFunctions(abi: Abi): ReadFunction[] {
	return getReadFunctions(abi).filter((fn) => fn.inputs.length === 0)
}

/**
 * Get functions with inputs (require user input)
 */
export function getInputFunctions(abi: Abi): ReadFunction[] {
	return getReadFunctions(abi).filter((fn) => fn.inputs.length > 0)
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
			return '0x...'
		case 'bool':
			return 'true or false'
		case 'string':
			return name || 'Enter text...'
		case 'bytes':
			return '0x...'
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
