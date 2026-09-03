import { describe, expect, test } from 'vitest'
import { buildReceiptPresentation } from '#lib/domain/receipt-presentation'
import { renderReceiptText } from '#lib/domain/receipt-text'

const sender = '0xea45a23d303f43491f5db087dca0bef2832d3f2a'
const hash =
	'0xce5226b560dd03cf4bd17dbe3f98bbcb1a38f0c118186544d02171161b1b4dfb'
const senpathUsde = '0x20c000000000000000000000C3268D803b51d448'
const dlusd = '0x20c0000000000000000000006fD9A167923ba194'
const feeToken = '0x20c0000000000000000000000000000000000000'

describe('renderReceiptText', () => {
	test('renders the same high-level events as the receipt card', () => {
		const block = { timestamp: 1_788_390_666n }
		const feeBreakdown = [
			{
				amount: 361n,
				currency: 'USD',
				decimals: 6,
				symbol: 'pathUSD',
				token: feeToken,
				payer: sender,
			},
		]
		const knownEvents = [
			{
				type: 'nonce incremented',
				parts: [{ type: 'action', value: 'Nonce Incremented' }],
			},
			{
				type: 'zone withdrawal',
				parts: [
					{ type: 'action', value: 'Private Zone Withdrawal' },
					{
						type: 'amount',
						value: {
							value: 250_120n,
							decimals: 6,
							symbol: 'senpathUSDE',
							token: senpathUsde,
						},
					},
					{ type: 'text', value: 'to' },
					{
						type: 'account',
						value: '0x8117E0ba6239B9695f780DEb010F72a2Fa4bdfb6',
					},
				],
			},
			{
				type: 'earn private redemption',
				parts: [
					{ type: 'action', value: 'Earn Redemption' },
					{
						type: 'amount',
						value: {
							value: 250_120n,
							decimals: 6,
							symbol: 'senpathUSDE',
							token: senpathUsde,
						},
					},
					{ type: 'text', value: 'for' },
					{
						type: 'amount',
						value: {
							value: 500_000n,
							decimals: 6,
							symbol: 'DLUSD',
							token: dlusd,
						},
					},
				],
			},
			{
				type: 'zone deposit',
				parts: [
					{ type: 'action', value: 'Private Zone Deposit' },
					{
						type: 'amount',
						value: {
							value: 500_000n,
							decimals: 6,
							symbol: 'DLUSD',
							token: dlusd,
						},
					},
				],
			},
		]
		const lineItems = {
			feeTotals: [{ ui: { left: 'Fee', right: '<$0.01' } }],
			totals: [{ ui: { left: 'Total', right: '$0.5' } }],
		}
		const receipt = {
			blockNumber: 37_714_808n,
			effectiveGasPrice: 1n,
			from: sender,
			gasUsed: 361n,
			status: 'success',
			transactionHash: hash,
		} as const
		const presentation = buildReceiptPresentation({
			chainId: 4217,
			feeBreakdown,
			feeToken,
			isTokenListed: (_chainId, token) => token !== senpathUsde,
			knownEvents,
			lineItems,
			receipt,
			voucher: null,
		})
		const text = renderReceiptText({ block, receipt }, presentation, {
			summary: 'Private Zone Withdrawal',
		})
		const lines = text.split('\n')

		expect(text).toContain('SUMMARY: PRIVATE ZONE WITHDRAWAL')
		expect(lines.find((line) => line.startsWith('1. '))).toMatch(
			/^1\. PRIVATE ZONE WITHDRAWAL\s+–$/,
		)
		expect(text).toContain('  0.25012 SENPATHUSDE TO 0X8117…DFB6')
		expect(lines.find((line) => line.startsWith('2. '))).toMatch(
			/^2\. EARN REDEMPTION\s+–$/,
		)
		expect(text).toContain('  0.25012 SENPATHUSDE FOR 0.5 DLUSD')
		expect(lines.find((line) => line.startsWith('3. '))).toMatch(
			/^3\. PRIVATE ZONE DEPOSIT\s+–$/,
		)
		expect(lines.find((line) => line.startsWith('FEE '))).toMatch(
			/^FEE \(PATHUSD\)\s+<\$0\.01$/,
		)
		expect(text).not.toContain('NONCE INCREMENTED')
		expect(text).not.toContain('TOTAL')
	})
})
