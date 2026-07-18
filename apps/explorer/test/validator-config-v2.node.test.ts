import { describe, expect, it } from 'vitest'
import { decodeFunctionData, encodeFunctionData, getAbiItem } from 'viem'
import { Abis, validatorConfigV2Address } from '#lib/abis'
import { getAccountTag } from '#lib/account'
import { autoloadAbi, getContractInfo } from '#lib/domain/contracts'

describe('Validator Config V2 precompile ABI', () => {
	it('registers the precompile address for ABI rendering', () => {
		const info = getContractInfo(validatorConfigV2Address)

		expect(info?.name).toBe('Validator Config V2')
		expect(info?.abi).toBe(Abis.validatorConfigV2)
		expect(
			getAbiItem({
				abi: info?.abi ?? [],
				name: 'deactivateValidator',
			}),
		).toBeDefined()
	})

	it('labels the precompile account', () => {
		expect(getAccountTag(validatorConfigV2Address)).toEqual({
			id: 'system:validator-config-v2',
			label: 'Validator Config V2',
		})
	})

	it('decodes validator deactivation calldata', () => {
		const data = encodeFunctionData({
			abi: Abis.validatorConfigV2,
			functionName: 'deactivateValidator',
			args: [4n],
		})

		const decoded = decodeFunctionData({
			abi: Abis.validatorConfigV2,
			data,
		})

		expect(decoded.functionName).toBe('deactivateValidator')
		expect(decoded.args[0]).toBe(4n)
	})

	it('returns the known registry ABI before network lookup', async () => {
		await expect(autoloadAbi(validatorConfigV2Address)).resolves.toBe(
			Abis.validatorConfigV2,
		)
	})
})