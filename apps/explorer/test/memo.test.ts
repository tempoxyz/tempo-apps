import { describe, expect, it } from 'vitest'
import type * as Hex from 'ox/Hex'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { Abis } from '#lib/abis'
import {
	accountAddress,
	getTokenMetadata,
	mockLog,
	mockReceipt,
	recipientAddress,
	userTokenAddress,
} from '#lib/demo'
import { parseKnownEvents } from '#lib/domain/known-events'
import { decodeMemoForDisplay, isMppAttributionMemo } from '#lib/domain/memo'
import { LineItems } from '#lib/domain/receipt'

const mppAttributionMemo =
	'0xef1ed712010102030405060708090a0000000000000000000000000000000000' as Hex.Hex
const providedReceiptHash =
	'0x0b854031dd4235d6c56024331323305c3db4444feaae885a2875e068f7fbd557' as Hex.Hex
const providedReceiptSender =
	'0xc3880847eb13415f567e1d7fddbd1999b46b5d45' as const
const providedReceiptRecipient =
	'0xca4e835f803cb0b7c428222b3a3b98518d4779fe' as const
const providedReceiptToken =
	'0x20c000000000000000000000b9537d11c60e8b50' as const
const providedReceiptMemo =
	'0xef1ed71201c62939e7f7496e1106ef00000000000000000000a166aee7e294f6' as Hex.Hex

describe('MPP attribution memos', () => {
	it('identifies and hides MPP attribution memos from generic memo display', () => {
		expect({
			isAttribution: isMppAttributionMemo(mppAttributionMemo),
			display: decodeMemoForDisplay(mppAttributionMemo),
		}).toMatchInlineSnapshot(`
			{
			  "display": undefined,
			  "isAttribution": true,
			}
		`)
	})

	it('labels receipt transfers with MPP attribution memos as MPP payments', () => {
		const hash = `0x${'7'.repeat(64)}` as const
		const logs = [
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: accountAddress,
							to: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [1_000_000n]),
				},
				hash,
			),
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'TransferWithMemo',
						args: {
							from: accountAddress,
							memo: mppAttributionMemo,
							to: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [1_000_000n]),
				},
				hash,
			),
		]

		const receipt = mockReceipt(logs, accountAddress, hash)
		const lineItems = LineItems.fromReceipt(receipt, { getTokenMetadata })
		const knownEvents = parseKnownEvents(receipt, { getTokenMetadata })

		expect({
			knownEvents: knownEvents.map((event) => ({
				note: event.note,
				parts: event.parts,
				type: event.type,
			})),
			lineItems: lineItems.main.map((item) => item.ui),
		}).toMatchInlineSnapshot(`
			{
			  "knownEvents": [
			    {
			      "note": undefined,
			      "parts": [
			        {
			          "type": "action",
			          "value": "MPP Payment",
			        },
			        {
			          "type": "amount",
			          "value": {
			            "currency": "USD",
			            "decimals": 6,
			            "symbol": "USDC",
			            "token": "0xdddddddddddddddddddddddddddddddddddddddd",
			            "value": 1000000n,
			          },
			        },
			        {
			          "type": "text",
			          "value": "to",
			        },
			        {
			          "type": "account",
			          "value": "0x9999999999999999999999999999999999999999",
			        },
			      ],
			      "type": "send",
			    },
			  ],
			  "lineItems": [
			    {
			      "bottom": [],
			      "left": "MPP Payment to 0x9999…9999",
			      "right": "$1",
			    },
			  ],
			}
		`)
	})

	it('labels the provided receipt hash fixture as an MPP payment', () => {
		const logs = [
			mockLog(
				{
					address: providedReceiptToken,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: providedReceiptSender,
							to: providedReceiptRecipient,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [5_000n]),
				},
				providedReceiptHash,
			),
			mockLog(
				{
					address: providedReceiptToken,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'TransferWithMemo',
						args: {
							from: providedReceiptSender,
							memo: providedReceiptMemo,
							to: providedReceiptRecipient,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [5_000n]),
				},
				providedReceiptHash,
			),
		]
		const receipt = mockReceipt(
			logs,
			providedReceiptSender,
			providedReceiptHash,
		)
		const getProvidedTokenMetadata = () => ({
			currency: 'USD',
			decimals: 6,
			logoURI: '',
			name: 'Path USD',
			symbol: 'pathUSD',
			totalSupply: 0n,
		})
		const knownEvents = parseKnownEvents(receipt, {
			getTokenMetadata: getProvidedTokenMetadata,
		})
		const lineItems = LineItems.fromReceipt(receipt, {
			getTokenMetadata: getProvidedTokenMetadata,
		})

		expect({
			firstEventAction: knownEvents[0]?.parts[0],
			firstLineItem: lineItems.main[0]?.ui,
			memoDisplay: decodeMemoForDisplay(providedReceiptMemo),
		}).toMatchInlineSnapshot(`
			{
			  "firstEventAction": {
			    "type": "action",
			    "value": "MPP Payment",
			  },
			  "firstLineItem": {
			    "bottom": [],
			    "left": "MPP Payment to 0xca4e…79Fe",
			    "right": "<$0.01",
			  },
			  "memoDisplay": undefined,
			}
		`)
	})
})
