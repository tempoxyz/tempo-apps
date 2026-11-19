import { describe, expect, it } from 'vitest'
import {
	decodeErrorResult,
	type Hex,
	decodeEventLog,
	decodeFunctionData,
	encodeErrorResult,
	encodeEventTopics,
	encodeFunctionData,
	getAbiItem,
	keccak256,
	toEventSelector,
	toHex,
} from 'viem'
import {
	Abis,
	allAbis,
	tip20ChannelReserveAbi,
	tip20ChannelReserveAddress,
} from '#lib/abis'
import { autoloadAbi, getContractInfo } from '#lib/domain/contracts'

const descriptor = {
	payer: '0x1111111111111111111111111111111111111111',
	payee: '0x2222222222222222222222222222222222222222',
	operator: '0x3333333333333333333333333333333333333333',
	token: '0x20c0000000000000000000000000000000000000',
	salt: `0x${'4'.repeat(64)}` as const,
	authorizedSigner: '0x5555555555555555555555555555555555555555',
	expiringNonceHash: `0x${'6'.repeat(64)}` as const,
} as const

describe('TIP-20 channel reserve ABI', () => {
	it('extends the Viem TIP-20 channel reserve ABI with T15 items', () => {
		expect(tip20ChannelReserveAbi).toBe(Abis.tip20ChannelReserve)
		const names = tip20ChannelReserveAbi.map((item) => item.name)
		for (const name of ['open', 'settle', 'ChannelOpened', 'RootKeyRetired'])
			expect(names).toContain(name)
		expect('tip20ChannelEscrow' in Abis).toBe(false)
	})

	it('registers the TIP-1034 precompile address for ABI rendering', () => {
		const info = getContractInfo(tip20ChannelReserveAddress)

		expect(info?.name).toBe('TIP-20 Channel Reserve')
		expect(info?.abi).toBe(tip20ChannelReserveAbi)
		for (const name of ['close', 'verifyVoucher', 'OpeningCommitmentRecorded'])
			expect(getAbiItem({ abi: info?.abi ?? [], name })).toBeDefined()
	})

	it('decodes descriptor-based channel calldata', () => {
		const data = encodeFunctionData({
			abi: tip20ChannelReserveAbi,
			functionName: 'close',
			args: [descriptor, 100n, 90n, '0x1234'],
		})

		const decoded = decodeFunctionData({
			abi: tip20ChannelReserveAbi,
			data,
		})

		expect(decoded.functionName).toBe('close')
		expect(decoded.args[0]).toMatchObject({
			...descriptor,
			token: '0x20C0000000000000000000000000000000000000',
		})
		expect(decoded.args[1]).toBe(100n)
		expect(decoded.args[2]).toBe(90n)
	})

	it('decodes the T15 OpeningCommitmentRecorded event', () => {
		const channelId = `0x${'7'.repeat(64)}` as const
		const signer = '0x5555555555555555555555555555555555555555'
		const commitment = `0x${'8'.repeat(64)}` as const

		const event = getAbiItem({
			abi: tip20ChannelReserveAbi,
			name: 'OpeningCommitmentRecorded',
		})
		expect(toEventSelector(event)).toBe(
			keccak256(toHex('OpeningCommitmentRecorded(bytes32,address,bytes32)')),
		)

		// Both indexed args are set, so every topic is a single hex value.
		const topics = encodeEventTopics({
			abi: tip20ChannelReserveAbi,
			eventName: 'OpeningCommitmentRecorded',
			args: { channelId, signer },
		}) as [Hex, ...Hex[]]
		const decoded = decodeEventLog({ abi: allAbis, topics, data: commitment })

		expect(decoded.eventName).toBe('OpeningCommitmentRecorded')
		expect(decoded.args).toEqual({ channelId, signer, commitment })
	})

	it('decodes T15 verifyVoucher calldata', () => {
		const data = encodeFunctionData({
			abi: tip20ChannelReserveAbi,
			functionName: 'verifyVoucher',
			args: [descriptor, 100n, '0x1234'],
		})

		const decoded = decodeFunctionData({ abi: tip20ChannelReserveAbi, data })

		expect(decoded.functionName).toBe('verifyVoucher')
		expect(decoded.args[0]).toMatchObject({
			...descriptor,
			token: '0x20C0000000000000000000000000000000000000',
		})
		expect(decoded.args[1]).toBe(100n)
		expect(decoded.args[2]).toBe('0x1234')
	})

	it.each([
		{ errorName: 'RootKeyRetired', args: [descriptor.payer] },
		{ errorName: 'SignerConfigChanged', args: [descriptor.authorizedSigner] },
		{
			errorName: 'SaltNotSignerCommitment',
			args: [descriptor.authorizedSigner, `0x${'9'.repeat(64)}`],
		},
	] as const)('decodes the T15 $errorName revert reason', ({
		errorName,
		args,
	}) => {
		const data = encodeErrorResult({
			abi: tip20ChannelReserveAbi,
			errorName,
			args,
		} as Parameters<typeof encodeErrorResult>[0])

		const decoded = decodeErrorResult({ abi: allAbis, data })

		expect(decoded.errorName).toBe(errorName)
		expect(decoded.args).toEqual(args)
	})

	it('returns known registry ABIs from autoload before network lookup', async () => {
		await expect(autoloadAbi(tip20ChannelReserveAddress)).resolves.toBe(
			tip20ChannelReserveAbi,
		)
	})
})
