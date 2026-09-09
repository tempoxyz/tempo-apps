import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	decodeAbiParameters,
	encodeAbiParameters,
	parseAbi,
	toEventSelector,
	type Abi,
} from 'viem'
import { Addresses } from 'viem/tempo'
import {
	zoneFactoryAbi,
	zoneMessengerAbi,
	zonePortalAbi,
	zoneVerifierAbi,
} from '#lib/abis'
import {
	getAbiItem,
	getContractAbi,
	getContractInfo,
	getReadFunctions,
	getWriteFunctions,
	isInferredAbi,
	isZonePortalAddress,
	resolveInteractAbi,
	systemAddress,
	TempoABILoader,
} from '#lib/domain/contracts'

describe('resolveInteractAbi', () => {
	it('preserves verified functions when the bundled Stream Channel ABI only contains events', () => {
		const address = '0x9d136eea063ede5418a6bc7beaff009bbb6cfa70'
		const verifiedAbi = parseAbi([
			'function CLOSE_GRACE_PERIOD() view returns (uint256)',
			'function requestClose(bytes32 channelId)',
		])
		const bundledAbi = getContractAbi(address)
		expect(bundledAbi?.length).toBeGreaterThan(0)
		expect(bundledAbi?.every((item) => item.type === 'event')).toBe(true)

		const abi = resolveInteractAbi({ address, abi: verifiedAbi })
		expect
			.soft(getReadFunctions(abi ?? []).map((fn) => fn.name))
			.toEqual(['CLOSE_GRACE_PERIOD'])
		expect
			.soft(getWriteFunctions(abi ?? []).map((fn) => fn.name))
			.toEqual(['requestClose'])
	})

	it('prefers the canonical Zone Portal interface over supplied and implementation ABIs', () => {
		const incompleteAbi = parseAbi(['function pause()'])
		const abi = resolveInteractAbi({
			address: '0x5ad0000000000000000000000000000000000003',
			abi: incompleteAbi,
			implementationAbi: incompleteAbi,
		})
		expect(abi).toBe(zonePortalAbi)
	})
})

const proxyImplementationAbi = [
	{
		type: 'function',
		name: 'supportsInterface',
		stateMutability: 'view',
		inputs: [{ name: 'interfaceId', type: 'bytes4' }],
		outputs: [{ name: '', type: 'bool' }],
	},
	{
		type: 'function',
		name: 'reserveStores',
		stateMutability: 'view',
		inputs: [{ name: 'token', type: 'address' }],
		outputs: [{ name: '', type: 'address' }],
	},
	{
		type: 'function',
		name: 'BURNER_ROLE',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'bytes32' }],
	},
	{
		type: 'function',
		name: 'MINT_RATE_LIMIT_SETTER_ROLE',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ name: '', type: 'bytes32' }],
	},
	{
		type: 'function',
		name: 'minterAllowances',
		stateMutability: 'view',
		inputs: [
			{ name: 'minter', type: 'address' },
			{ name: 'token', type: 'address' },
		],
		outputs: [{ name: '', type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'mintTxnLimits',
		stateMutability: 'view',
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
	stateMutability: 'nonpayable',
	selector: `0x${index.toString(16).padStart(8, '0')}`,
})) as Abi

describe('contract function classification', () => {
	it('trusts compiler mutability even when names suggest the opposite', () => {
		const abi = [
			{
				type: 'function',
				name: 'paused',
				stateMutability: 'view',
				inputs: [],
				outputs: [{ type: 'bool' }],
			},
			{
				type: 'function',
				name: 'calculateAndStore',
				stateMutability: 'nonpayable',
				inputs: [],
				outputs: [{ type: 'uint256' }],
			},
			{
				type: 'function',
				name: 'getAndPay',
				stateMutability: 'payable',
				inputs: [],
				outputs: [{ type: 'uint256' }],
			},
			{
				type: 'function',
				name: 'compute',
				stateMutability: 'pure',
				inputs: [],
				outputs: [{ type: 'uint256' }],
			},
		] as const satisfies Abi
		expect(getReadFunctions(abi).map((fn) => fn.name)).toEqual([
			'paused',
			'compute',
		])
		expect(getWriteFunctions(abi).map((fn) => fn.name)).toEqual([
			'calculateAndStore',
			'getAndPay',
		])
		expect(getReadFunctions(abi)[0]).toBe(abi[0])
	})

	it('identifies inferred entries without relabeling compiler ABIs', () => {
		expect(isInferredAbi(whatsabiImplementationAbi)).toBe(true)
		expect(isInferredAbi(proxyImplementationAbi)).toBe(false)
		expect(isInferredAbi([])).toBe(false)
	})

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

describe('Tempo ABI lookup', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.unstubAllEnvs()
		vi.resetModules()
	})

	it('loads the verified implementation ABI from the default host without losing metadata', async () => {
		const abi = [
			{
				type: 'function',
				name: 'paused',
				stateMutability: 'view',
				inputs: [],
				outputs: [{ type: 'bool' }],
			},
		]
		const fetch = vi
			.fn()
			.mockResolvedValue(Response.json({ match: 'exact_match', abi }))
		vi.stubGlobal('fetch', fetch)
		const loader = new TempoABILoader({ chainId: 4217 })
		const result = await loader.loadABI(
			'0x3B3F2e2aa07460a9ba95ffd06ad9597398Bbbab7',
		)
		expect(fetch).toHaveBeenCalledWith(
			'https://contracts.tempo.xyz/v2/contract/4217/0x3b3f2e2aa07460a9ba95ffd06ad9597398bbbab7?fields=abi',
		)
		expect(result).toEqual(abi)
		expect(isInferredAbi(result as Abi)).toBe(false)
	})

	it('honors the configured verifier host and requested chain', async () => {
		vi.stubEnv(
			'VITE_CONTRACT_VERIFICATION_API_BASE_URL',
			'https://verifier.example',
		)
		vi.resetModules()
		const { TempoABILoader } = await import('#lib/domain/contracts')
		const fetch = vi.fn().mockResolvedValue(Response.json({ abi: [] }))
		vi.stubGlobal('fetch', fetch)
		await new TempoABILoader({ chainId: 42431 }).loadABI(
			'0x0000000000000000000000000000000000000001',
		)
		expect(fetch).toHaveBeenCalledWith(
			'https://verifier.example/v2/contract/42431/0x0000000000000000000000000000000000000001?fields=abi',
		)
	})

	it('allows inference when the contract is not verified', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					Response.json({ customCode: 'contract_not_found' }, { status: 404 }),
				),
		)
		expect(
			await new TempoABILoader({ chainId: 4217 }).loadABI(
				'0x0000000000000000000000000000000000000001',
			),
		).toEqual([])
	})
})

describe('Zone protocol contracts', () => {
	it('registers the Zone protocol addresses exported by viem', () => {
		expect(getContractInfo(Addresses.zoneFactory)).toMatchObject({
			name: 'Zone Factory',
			abi: zoneFactoryAbi,
		})
		expect(getContractInfo(Addresses.zonePortalImplementation)).toMatchObject({
			name: 'Zone Portal Implementation',
			abi: zonePortalAbi,
		})
		expect(getContractInfo(Addresses.zoneMessenger)).toMatchObject({
			name: 'Zone Messenger',
			abi: zoneMessengerAbi,
		})
		expect(getContractInfo(Addresses.zoneVerifier)?.name).toBe('Zone Verifier')
		expect(getContractInfo(Addresses.zoneVerifier)?.abi).toBe(zoneVerifierAbi)
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
		expect(getWriteFunctions(zonePortalAbi).map((fn) => fn.name)).toContain(
			'resume',
		)
		expect(getReadFunctions(zonePortalAbi).map((fn) => fn.name)).toEqual(
			expect.arrayContaining(['paused', 'pauseExpiry']),
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
