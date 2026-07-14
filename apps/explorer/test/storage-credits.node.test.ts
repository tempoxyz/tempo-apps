import { describe, expect, it } from 'vitest'
import { decodeFunctionData, encodeFunctionData, getAbiItem } from 'viem'
import { Addresses } from 'viem/tempo'
import { Abis } from '#lib/abis'
import { autoloadAbi, getContractInfo } from '#lib/domain/contracts'

describe('Storage Credits precompile ABI', () => {
	it('registers the TIP-1060 precompile address for ABI rendering', () => {
		const info = getContractInfo(Addresses.storageCredits)

		expect(info?.name).toBe('Storage Credits')
		expect(info?.abi).toBe(Abis.storageCredits)
		expect(
			getAbiItem({
				abi: info?.abi ?? [],
				name: 'balanceOf',
			}),
		).toBeDefined()
	})

	it('decodes storage credit calldata', () => {
		const data = encodeFunctionData({
			abi: Abis.storageCredits,
			functionName: 'setBudget',
			args: [12n],
		})

		const decoded = decodeFunctionData({
			abi: Abis.storageCredits,
			data,
		})

		expect(decoded.functionName).toBe('setBudget')
		expect(decoded.args[0]).toBe(12n)
	})

	it('returns the known registry ABI from autoload before network lookup', async () => {
		await expect(autoloadAbi(Addresses.storageCredits)).resolves.toBe(
			Abis.storageCredits,
		)
	})
})
