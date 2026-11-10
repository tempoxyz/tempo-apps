import { describe, expect, it } from 'vitest'
import {
	bytes32ToText,
	compareLogsDesc,
	type Erc20ProbeResults,
	interpretErc20Probe,
	dataToValue,
	reconcileHolders,
	replayBalances,
	topicToAddress,
	type TransferLog,
	ZERO_ADDRESS,
} from '#lib/domain/erc20'

const alice = '0x00000000000000000000000000000000000000a1'
const bob = '0x00000000000000000000000000000000000000b2'
const topic = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}`
const amount = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`
const log = (from: string, to: string, value: bigint) => ({
	topic1: topic(from),
	topic2: topic(to),
	data: amount(value),
})

describe('ERC-20 log decoding', () => {
	it('reads the address from an indexed topic', () => {
		expect(topicToAddress(topic(alice).toUpperCase().replace('0X', '0x'))).toBe(
			alice,
		)
		expect(topicToAddress(null)).toBe(ZERO_ADDRESS)
	})

	it('reads only the leading 32-byte amount', () => {
		expect(dataToValue(`${amount(12n)}${'ff'.repeat(32)}`)).toBe(12n)
		expect(dataToValue('0x')).toBe(0n)
		expect(dataToValue(null)).toBe(0n)
	})

	it('orders logs newest first by block, then log index', () => {
		const at = (block_num: number, log_idx: number) =>
			({ block_num, log_idx }) as TransferLog
		const sorted = [at(1, 2), at(2, 0), at(1, 5)].sort(compareLogsDesc)
		expect(sorted.map((l) => [l.block_num, l.log_idx])).toEqual([
			[2, 0],
			[1, 5],
			[1, 2],
		])
	})
})

describe('ERC-20 holder replay', () => {
	it('nets transfers and leaves out the zero address', () => {
		const balances = replayBalances([
			log(ZERO_ADDRESS, alice, 12n),
			log(alice, bob, 5n),
			log(bob, ZERO_ADDRESS, 1n),
		])
		expect([...balances]).toEqual([
			[alice, 7n],
			[bob, 4n],
		])
	})

	it('returns holders largest first when the sum matches supply', () => {
		const balances = replayBalances([
			log(ZERO_ADDRESS, alice, 3n),
			log(ZERO_ADDRESS, bob, 9n),
			log(alice, bob, 3n),
		])
		expect(reconcileHolders(balances, 12n)).toEqual({
			holders: [[bob, 12n]],
			totalBalance: 12n,
		})
	})

	it('rejects balances that do not reconcile with supply', () => {
		const balances = replayBalances([log(ZERO_ADDRESS, alice, 12n)])
		expect(reconcileHolders(balances, 13n)).toBeUndefined()
	})

	it('rejects negative balances from transfers never minted by a log', () => {
		const balances = replayBalances([
			log(alice, bob, 5n),
			log(ZERO_ADDRESS, bob, 0n),
		])
		expect(reconcileHolders(balances, 0n)).toBeUndefined()
	})
})

describe('ERC-20 detection probe', () => {
	const token = '0xa8f92fb1a7aa32e5db3c719b707eb2b3bed00543'
	const base: Erc20ProbeResults = {
		decimals: 18,
		totalSupply: 12n,
		balanceOf: 0n,
		allowance: 0n,
		name: 'Steven Coin',
		symbol: 'SC',
		nameBytes32: undefined,
		symbolBytes32: undefined,
		isErc721: undefined,
		isErc1155: undefined,
	}

	it('accepts a contract answering the required views', () => {
		expect(interpretErc20Probe(token, base)).toEqual({
			name: 'Steven Coin',
			symbol: 'SC',
			decimals: 18,
			totalSupply: 12n,
		})
	})

	it('requires balanceOf, allowance, decimals and totalSupply', () => {
		for (const key of ['balanceOf', 'allowance', 'decimals', 'totalSupply'])
			expect(
				interpretErc20Probe(token, { ...base, [key]: undefined }),
			).toBeUndefined()
	})

	it('rejects contracts claiming ERC-721 or ERC-1155', () => {
		expect(
			interpretErc20Probe(token, { ...base, isErc721: true }),
		).toBeUndefined()
		expect(
			interpretErc20Probe(token, { ...base, isErc1155: true }),
		).toBeUndefined()
	})

	it('reads bytes32 names and falls back to the address', () => {
		const mkr = `0x${'4d4b52'.padEnd(64, '0')}` as const
		expect(
			interpretErc20Probe(token, {
				...base,
				name: undefined,
				symbol: undefined,
				symbolBytes32: mkr,
			}),
		).toMatchObject({ name: 'MKR', symbol: 'MKR' })
		expect(
			interpretErc20Probe(token, {
				...base,
				name: undefined,
				symbol: undefined,
			}),
		).toMatchObject({ name: '0xa8f9…0543', symbol: '' })
		expect(bytes32ToText(`0x${'0'.repeat(64)}`)).toBeUndefined()
	})
})
