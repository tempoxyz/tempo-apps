import { describe, expect, it } from 'vitest'
import {
	decodeAbiParameters,
	encodeAbiParameters,
	toEventSelector,
	type Abi,
} from 'viem'
import { Addresses as ZoneAddresses } from 'viem-zones/tempo'
import {
	zoneFactoryAbi,
	zoneMessengerAbi,
	zonePortalAbi,
	zoneVerifierAbi,
} from '#lib/abis'
import {
	getAbiItem,
	getContractInfo,
	getReadFunctions,
	getWriteFunctions,
	isZonePortalAddress,
	systemAddress,
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
		expect(getContractInfo(ZoneAddresses.zoneMessenger)).toMatchObject({
			name: 'Zone Messenger',
			abi: zoneMessengerAbi,
		})
		expect(getContractInfo(ZoneAddresses.zoneVerifier)?.name).toBe(
			'Zone Verifier',
		)
		expect(getContractInfo(ZoneAddresses.zoneVerifier)?.abi).toBe(
			zoneVerifierAbi,
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
		expect(
			getAbiItem({ abi: zonePortalAbi, selector: '0x78fb159b' })?.name,
		).toBe('submitBatch')
		expect(
			getAbiItem({ abi: zonePortalAbi, selector: '0x91aa3f04' })?.name,
		).toBe('processWithdrawals')
		expect(
			getAbiItem({ abi: zonePortalAbi, selector: '0x005d97ef' })?.name,
		).toBe('deliverWithdrawal')
		expect(
			getAbiItem({ abi: zoneMessengerAbi, selector: '0x11da5261' })?.name,
		).toBe('relayMessage')
		expect(
			getAbiItem({ abi: zoneVerifierAbi, selector: '0x7106a43e' })?.name,
		).toBe('verify')
		expect(
			zonePortalAbi.some(
				(item) =>
					item.type === 'event' &&
					toEventSelector(item) ===
						'0x5a66941dc92cb865480c966eff640c02b1d00d544b74332fd67c6f1cbfccdf39',
			),
		).toBe(true)
	})

	it('recognizes deterministic Zone Portal proxy addresses', () => {
		const portal = '0x5ad0000000000000000000000000000000000003'

		expect(isZonePortalAddress(portal)).toBe(true)
		expect(systemAddress(portal)).toBe(true)
		expect(getContractInfo(portal)).toMatchObject({
			name: 'Zone Portal Proxy #3',
			description: 'ERC-1167 minimal proxy for Tempo Zone 3',
			abi: zonePortalAbi,
		})
	})

	it('recognizes the EIP-2935 history contract', () => {
		const info = getContractInfo('0x0000f90827f1c53a10cb7a02335b175320002935')
		expect(info).toMatchObject({ name: 'Block Hash History' })
		const getBlockHash = info?.abi.find(
			(item) => item.type === 'function' && item.name === 'getBlockHash',
		)
		expect(getBlockHash?.type).toBe('function')
		if (!getBlockHash || getBlockHash.type !== 'function') return
		const input = encodeAbiParameters(getBlockHash.inputs, [31_767_176n])
		expect(decodeAbiParameters(getBlockHash.inputs, input)).toEqual([
			31_767_176n,
		])
	})

	it('recognizes the TIP-1020 signature verification precompile', () => {
		const info = getContractInfo('0x5165300000000000000000000000000000000000')
		expect(info).toMatchObject({
			name: 'Signature Verification',
			category: 'precompile',
		})
		expect(info?.abi).toContainEqual(
			expect.objectContaining({ type: 'function', name: 'recover' }),
		)
		expect(info?.abi).toContainEqual(
			expect.objectContaining({ type: 'function', name: 'verify' }),
		)
	})
})
