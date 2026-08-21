import { describe, expect, it } from 'vitest'
import type { Abi } from 'viem'
import { Addresses as ZoneAddresses } from 'viem-zones/tempo'
import { zoneFactoryAbi, zonePortalAbi } from '#lib/abis'
import {
	getContractInfo,
	getReadFunctions,
	getWriteFunctions,
} from '#lib/domain/contracts'

const proxyImplementationAbi = [
	{
		type: 'function',
		name: 'supportsInterface',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'interfaceId', type: 'bytes4' }],
		outputs: [{ name: '', type: 'bool' }],
	},
	{
		type: 'function',
		name: 'reserveStores',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'token', type: 'address' }],
		outputs: [{ name: '', type: 'address' }],
	},
	{
		type: 'function',
		name: 'BURNER_ROLE',
		stateMutability: 'nonpayable',
		inputs: [],
		outputs: [{ name: '', type: 'bytes32' }],
	},
	{
		type: 'function',
		name: 'MINT_RATE_LIMIT_SETTER_ROLE',
		stateMutability: 'nonpayable',
		inputs: [],
		outputs: [{ name: '', type: 'bytes32' }],
	},
	{
		type: 'function',
		name: 'minterAllowances',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'minter', type: 'address' },
			{ name: 'token', type: 'address' },
		],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'mintTxnLimits',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'minter', type: 'address' }],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'mint',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'amount', type: 'uint256' }],
		outputs: [],
	},
	{
		type: 'function',
		name: 'setMinterAllowance',
		stateMutability: 'nonpayable',
		inputs: [{ name: 'amount', type: 'uint256' }],
		outputs: [],
	},
] as const satisfies Abi

const whatsabiImplementationAbi = proxyImplementationAbi.map((fn, index) => ({
	...fn,
	selector: `0x${index.toString(16).padStart(8, '0')}`,
})) as Abi

describe('contract function classification', () => {
	it('keeps getter-style implementation functions out of Write', () => {
		for (const abi of [proxyImplementationAbi, whatsabiImplementationAbi]) {
			const reads = getReadFunctions(abi)
			const writes = getWriteFunctions(abi)

			expect(reads.map((fn) => fn.name)).toEqual([
				'supportsInterface',
				'reserveStores',
				'BURNER_ROLE',
				'MINT_RATE_LIMIT_SETTER_ROLE',
				'minterAllowances',
				'mintTxnLimits',
			])
			expect(writes.map((fn) => fn.name)).toEqual([
				'mint',
				'setMinterAllowance',
			])
		}
	})
})

describe('Zone protocol contracts', () => {
	it('registers the Zone protocol addresses exported by viem', () => {
		expect(getContractInfo(ZoneAddresses.zoneFactory)).toMatchObject({
			name: 'Zone Factory',
			abi: zoneFactoryAbi,
		})
		expect(
			getContractInfo(ZoneAddresses.zonePortalImplementation),
		).toMatchObject({
			name: 'Zone Portal Implementation',
			abi: zonePortalAbi,
		})
		expect(getContractInfo(ZoneAddresses.zoneMessenger)?.name).toBe(
			'Zone Messenger',
		)
		expect(getContractInfo(ZoneAddresses.zoneVerifier)?.name).toBe(
			'Zone Verifier',
		)
	})

	it('exposes Zone registry and portal administration functions', () => {
		expect(getReadFunctions(zoneFactoryAbi).map((fn) => fn.name)).toContain(
			'zones',
		)
		expect(getReadFunctions(zonePortalAbi).map((fn) => fn.name)).toContain(
			'tokenConfig',
		)
		expect(getWriteFunctions(zonePortalAbi).map((fn) => fn.name)).toContain(
			'pause',
		)
	})
})
