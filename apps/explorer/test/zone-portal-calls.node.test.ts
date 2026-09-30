import { describe, expect, it } from 'vitest'
import {
	decodeFunctionData,
	encodeFunctionData,
	parseAbi,
	zeroHash,
} from 'viem'
import { getContractAbi } from '#lib/domain/contracts'
import { decodeKnownCall } from '#lib/domain/known-events'
import { getKnownTraceAbiItem } from '#lib/domain/trace-abi'
import { zoneProverCall } from './fixtures/zone-prover-call'

describe('Zone Portal submitBatch compatibility', () => {
	it('decodes the reported T13 prover transaction with the address ABI', () => {
		const abi = getContractAbi(zoneProverCall.to) ?? []
		const decoded = decodeFunctionData({ abi, data: zoneProverCall.input })
		expect(decoded.functionName).toBe('submitBatch')
		expect(decoded.args).toHaveLength(10)
		expect(decoded.args?.[0]).toBe(43438n)
		expect(decoded.args?.[4]).toEqual({
			prevProcessedTokenCount: 1n,
			nextProcessedTokenCount: 1n,
		})
		expect(decoded.args?.[5]).toBe(zeroHash)
		expect(decoded.args?.[6]).toBe('0x01')
		expect(decoded.args?.[8]).toBe(35280n)
		expect(decoded.args?.[9]).toHaveLength(3)
		expect(encodeFunctionData({ abi, ...decoded })).toBe(zoneProverCall.input)
		expect(
			decodeKnownCall(zoneProverCall.to, zoneProverCall.input),
		).toMatchObject({
			type: 'zone batch submission',
			note: [
				['Tempo Block', { type: 'number', value: 43438n }],
				['Zone Height', { type: 'number', value: 35280n }],
				['Withdrawals', { type: 'text', value: 'None' }],
			],
		})
	})

	it('preserves pre-T13 calldata and summary argument positions', () => {
		const legacyAbi = parseAbi([
			'function submitBatch(uint64,uint64,(bytes32,bytes32),(bytes32,bytes32,uint64,uint64),bytes32,bytes,bytes,uint256,bytes[])',
		])
		const input = encodeFunctionData({
			abi: legacyAbi,
			functionName: 'submitBatch',
			args: [
				42n,
				0n,
				[zeroHash, zeroHash],
				[zeroHash, zeroHash, 2n, 3n],
				zeroHash,
				'0x01',
				'0x1234',
				99n,
				[],
			],
		})
		expect(input.slice(0, 10)).toBe('0x78fb159b')
		expect(
			decodeFunctionData({
				abi: getContractAbi(zoneProverCall.to) ?? [],
				data: input,
			}).functionName,
		).toBe('submitBatch')
		expect(decodeKnownCall(zoneProverCall.to, input)).toMatchObject({
			type: 'zone batch submission',
			note: [
				['Tempo Block', { type: 'number', value: 42n }],
				['Zone Height', { type: 'number', value: 99n }],
				['Withdrawals', { type: 'text', value: 'None' }],
			],
		})
	})

	it.each([
		'0x4cd6c7c7',
		'0x78fb159b',
	] as const)('recognizes %s in call traces without a signature registry', (selector) => {
		expect(getKnownTraceAbiItem(selector)?.name).toBe('submitBatch')
	})
})
