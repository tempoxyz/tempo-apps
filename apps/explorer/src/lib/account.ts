import type * as Address from 'ox/Address'
import * as Hex from 'ox/Hex'
import { z } from 'zod/mini'

export const zAccountType = () => z.enum(['empty', 'account', 'contract'])
export type AccountType = z.infer<ReturnType<typeof zAccountType>>

// EIP-7702 delegation: prefix (3 bytes) + address (20 bytes) = 23 bytes
function isEip7702Delegation(code: Hex.Hex): boolean {
	return Hex.size(code) === 23 && code.toLowerCase().startsWith('0xef0100')
}

export function getAccountType(code: Hex.Hex | undefined): AccountType {
	if (!code || code === '0x') return 'empty'
	if (isEip7702Delegation(code)) return 'account'
	return 'contract'
}

export type AccountTag = { id: string; label: string }

const taggedAccounts: Record<Address.Address, AccountTag> = {
	// system contracts
	'0x20fc000000000000000000000000000000000000': {
		id: 'system:tip20-factory',
		label: 'TIP-20 Factory',
	},
	'0xfeec000000000000000000000000000000000000': {
		id: 'system:fee-manager',
		label: 'Fee Manager',
	},
	'0xdec0000000000000000000000000000000000000': {
		id: 'system:stablecoin-dex',
		label: 'Stablecoin DEX',
	},
	'0x403c000000000000000000000000000000000000': {
		id: 'system:tip403-registry',
		label: 'TIP-403 Registry',
	},
	'0xaaaaaaa000000000000000000000000000000000': {
		id: 'system:account-keychain',
		label: 'Account Keychain',
	},
	'0x7702c00000000000000000000000000000000000': {
		id: 'system:default-account',
		label: 'Default Account',
	},
	'0xcccccccc00000000000000000000000000000000': {
		id: 'system:validator-config',
		label: 'Validator Config',
	},
	'0x4e4f4e4345000000000000000000000000000000': {
		id: 'system:nonce-manager',
		label: 'Nonce Manager',
	},
	// genesis tip20 tokens
	'0x20c0000000000000000000000000000000000000': {
		id: 'genesis-token:pathusd',
		label: 'pathUSD',
	},
	'0x20c0000000000000000000000000000000000001': {
		id: 'genesis-token:alphausd',
		label: 'AlphaUSD',
	},
	'0x20c0000000000000000000000000000000000002': {
		id: 'genesis-token:betausd',
		label: 'BetaUSD',
	},
	'0x20c0000000000000000000000000000000000003': {
		id: 'genesis-token:thetausd',
		label: 'ThetaUSD',
	},
}

export function getAccountTag(
	address: Address.Address,
): AccountTag | undefined {
	return taggedAccounts[address.toLowerCase() as Address.Address]
}

export function isSystemAddress(address: Address.Address): boolean {
	const tag = getAccountTag(address)
	if (!tag) return false
	return tag.id.startsWith('system:') || tag.id.startsWith('genesis-token:')
}
