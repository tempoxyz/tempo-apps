import { describe, expect, it } from 'vitest'
import { decodeFunctionData, encodeFunctionData, getAbiItem } from 'viem'
import { storageCreditsAbi, storageCreditsAddress } from '#lib/abis'
import { autoloadAbi, getContractInfo } from '#lib/domain/contracts'

describe('Storage Credits precompile ABI', () => {
	it('registers the TIP-1060 precompile address for ABI rendering', () => {
		const info = getContractInfo(storageCreditsAddress)

		expect(info?.name).toBe('Storage Credits')
		expect(info?.abi).toBe(storageCreditsAbi)
		expect(
			getAbiItem({
				abi: info?.abi ?? [],
				name: 'balanceOf',
			}),
		).toBeDefined()
	})

	it('decodes storage credit calldata', () => {
		const data = encodeFunctionData({
			abi: storageCreditsAbi,
			functionName: 'setBudget',
			args: [12n],
		})

		const decoded = decodeFunctionData({
			abi: storageCreditsAbi,
			data,
		})

		expect(decoded.functionName).toBe('setBudget')
		expect(decoded.args[0]).toBe(12n)
	})

	it('returns the known registry ABI from autoload before network lookup', async () => {
		await expect(autoloadAbi(storageCreditsAddress)).resolves.toBe(
			storageCreditsAbi,
		)
	})
})
