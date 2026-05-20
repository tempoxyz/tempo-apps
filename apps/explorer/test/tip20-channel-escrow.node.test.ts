import { describe, expect, it } from 'vitest'
import { decodeFunctionData, encodeFunctionData, getAbiItem } from 'viem'
import { tip20ChannelEscrowAbi, tip20ChannelEscrowAddress } from '#lib/abis'
import { autoloadAbi, getContractInfo } from '#lib/domain/contracts'

describe('TIP-20 channel escrow ABI', () => {
	it('registers the TIP-1034 precompile address for ABI rendering', () => {
		const info = getContractInfo(tip20ChannelEscrowAddress)

		expect(info?.name).toBe('TIP-20 Channel Escrow')
		expect(info?.abi).toBe(tip20ChannelEscrowAbi)
		expect(
			getAbiItem({
				abi: info?.abi ?? [],
				name: 'close',
			}),
		).toBeDefined()
	})

	it('decodes descriptor-based channel calldata', () => {
		const descriptor = {
			payer: '0x1111111111111111111111111111111111111111',
			payee: '0x2222222222222222222222222222222222222222',
			operator: '0x3333333333333333333333333333333333333333',
			token: '0x20c0000000000000000000000000000000000000',
			salt: `0x${'4'.repeat(64)}` as const,
			authorizedSigner: '0x5555555555555555555555555555555555555555',
			expiringNonceHash: `0x${'6'.repeat(64)}` as const,
		} as const

		const data = encodeFunctionData({
			abi: tip20ChannelEscrowAbi,
			functionName: 'close',
			args: [descriptor, 100n, 90n, '0x1234'],
		})

		const decoded = decodeFunctionData({
			abi: tip20ChannelEscrowAbi,
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

	it('returns known registry ABIs from autoload before network lookup', async () => {
		await expect(autoloadAbi(tip20ChannelEscrowAddress)).resolves.toBe(
			tip20ChannelEscrowAbi,
		)
	})
})
