import type { Address, Hex } from 'ox'
import { describe, expect, it } from 'vitest'
import { buildAddressTxMetadata } from '#lib/server/address-metadata'
import type { ContractCreationData } from '#lib/server/contract-creation'

describe('address metadata', () => {
	it('uses RPC contract creation fallback when indexed receipts miss creation', () => {
		const creation = {
			blockNumber: 10n,
			timestamp: 100n,
			hash: '0xcreate' as Hex.Hex,
			from: '0xdeployer' as Address.Address,
			to: null,
			value: 0n,
			status: 'success',
			gasUsed: 21_000n,
			effectiveGasPrice: 1n,
		} satisfies ContractCreationData

		expect(
			buildAddressTxMetadata(
				{
					count: 0,
					latestTxsBlockTimestamp: undefined,
					oldestTxsBlockTimestamp: undefined,
				},
				creation,
			),
		).toEqual({
			txCount: 1,
			lastActivityTimestamp: undefined,
			createdTimestamp: 100,
			createdTxHash: '0xcreate',
			createdBy: '0xdeployer',
		})
	})

	it('keeps older direct address activity as the created timestamp', () => {
		const creation = {
			blockNumber: 20n,
			timestamp: 200n,
			hash: '0xcreate' as Hex.Hex,
			from: '0xdeployer' as Address.Address,
			to: null,
			value: 0n,
			status: 'success',
			gasUsed: 21_000n,
			effectiveGasPrice: 1n,
		} satisfies ContractCreationData

		expect(
			buildAddressTxMetadata(
				{
					count: 3,
					latestTxsBlockTimestamp: 300,
					oldestTxsBlockTimestamp: 100,
					oldestTxHash: '0xold',
					oldestTxFrom: '0xsender',
				},
				creation,
			),
		).toEqual({
			txCount: 4,
			lastActivityTimestamp: 300,
			createdTimestamp: 100,
			createdTxHash: '0xold',
			createdBy: '0xsender',
		})
	})
})
