import { describe, expect, it } from 'vitest'
import { TxEnvelopeTempo } from 'ox/tempo'
import {
	buildSponsorshipIntentMessage,
	hashApiKey,
} from '../src/lib/billing.js'
import { pathUsd } from '../src/lib/consts.js'
import { tempoChain } from './helpers.js'

const apiKey = 'tp_test_key'
const sender = '0x0000000000000000000000000000000000000003'
const sponsorAddress = '0x0000000000000000000000000000000000000004'
const target = '0x0000000000000000000000000000000000000005'
const signedAt = '2026-06-20T12:00:00.000Z'
const attributionKey = 'privy-app-123'
const feePayerSignature = {
	r: `0x${'11'.repeat(32)}`,
	s: `0x${'22'.repeat(32)}`,
	yParity: '0x0',
}

function fillRequest(params = {}) {
	return {
		jsonrpc: '2.0',
		id: 1,
		method: 'eth_fillTransaction',
		params: [
			{
				from: sender,
				chainId: tempoChain.id,
				feePayer: true,
				calls: [{ to: target, value: '0x0', data: '0x' }],
				...params,
			},
		],
	}
}

function fillResponse(tx = {}) {
	return {
		jsonrpc: '2.0',
		id: 1,
		result: {
			tx: {
				from: sender,
				chainId: tempoChain.id,
				gas: '0xc350',
				maxFeePerGas: '0x4a817c800',
				maxPriorityFeePerGas: '0x1',
				nonce: '0x0',
				calls: [{ to: target, value: '0x0', data: '0x' }],
				feeToken: pathUsd,
				feePayerSignature,
				...tx,
			},
		},
	}
}

function buildFillMessage(overrides = {}) {
	return buildSponsorshipIntentMessage({
		apiKey,
		fallbackChainId: tempoChain.id,
		requestBody: fillRequest(),
		responseBody: fillResponse(),
		signedAt,
		sponsorAddress,
		...overrides,
	})
}

describe('billing sponsorship intents', () => {
	it('builds a sponsorship_intent message from eth_fillTransaction', () => {
		const message = buildFillMessage()

		expect(message).toMatchObject({
			type: 'sponsorship_intent',
			event: {
				apiKeyHash: hashApiKey(apiKey),
				chainId: tempoChain.id,
				feePayerSignature,
				signedAt,
				sponsorAddress,
			},
		})
		expect(message?.event.idempotencyKey).toMatch(/^sintent_[0-9a-f]{64}$/)
		expect(message?.event.feePayerPayloadHash).toMatch(/^0x[0-9a-f]{64}$/)
	})

	it('emits only the fields accepted by billing-srv', () => {
		const message = buildFillMessage()
		expect(message).not.toBeNull()
		if (!message) throw new Error('expected sponsorship intent message')

		expect(Object.keys(message).sort()).toEqual(['event', 'type'])
		expect(Object.keys(message.event).sort()).toEqual([
			'apiKeyHash',
			'chainId',
			'feePayerPayloadHash',
			'feePayerSignature',
			'idempotencyKey',
			'signedAt',
			'sponsorAddress',
		])

		const serialized = JSON.stringify(message)
		expect(serialized).not.toContain('signing_event')
		expect(serialized).not.toContain('eventId')
		expect(serialized).not.toContain('feePayerSigningPayloadHash')
		expect(serialized).not.toContain('appId')
		expect(serialized).not.toContain('accountId')
		expect(serialized).not.toContain('requestId')
	})

	it('includes an attribution key when provided', () => {
		const message = buildFillMessage({ attributionKey })

		expect(message?.event.attributionKey).toBe(attributionKey)
		expect(Object.keys(message?.event ?? {}).sort()).toEqual([
			'apiKeyHash',
			'attributionKey',
			'chainId',
			'feePayerPayloadHash',
			'feePayerSignature',
			'idempotencyKey',
			'signedAt',
			'sponsorAddress',
		])
	})

	it('builds deterministic idempotency keys for queue retries', () => {
		const first = buildFillMessage()
		const second = buildFillMessage()
		const differentApiKey = buildFillMessage({ apiKey: 'tp_other_key' })
		const differentPayload = buildFillMessage({
			responseBody: fillResponse({ nonce: '0x1' }),
		})

		expect(first?.event.idempotencyKey).toBe(second?.event.idempotencyKey)
		expect(differentApiKey?.event.idempotencyKey).not.toBe(
			first?.event.idempotencyKey,
		)
		expect(differentPayload?.event.idempotencyKey).not.toBe(
			first?.event.idempotencyKey,
		)
	})

	it('normalizes fill RPC quantities before hashing the fee-payer payload', () => {
		const chainId = `0x${tempoChain.id.toString(16)}`
		const nonceKey =
			'0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
		const validBefore = '0x6a39d553'
		const message = buildSponsorshipIntentMessage({
			apiKey,
			fallbackChainId: tempoChain.id,
			requestBody: fillRequest({
				chainId,
				calls: [{ to: target, value: '0x', data: '0x' }],
				nonce: '0x0',
				nonceKey,
				type: '0x76',
				validBefore,
			}),
			responseBody: fillResponse({
				chainId,
				calls: [{ to: target, data: '0x' }],
				gas: '0xd492',
				maxFeePerGas: '0x4a817c800',
				maxPriorityFeePerGas: '0x0',
				nonce: '0x0',
				validBefore,
			}),
			signedAt,
			sponsorAddress,
		})
		const equivalentMinedEnvelope = TxEnvelopeTempo.from({
			accessList: [],
			authorizationList: [],
			calls: [{ to: target, value: 0n, data: '0x' }],
			chainId: tempoChain.id,
			feeToken: pathUsd,
			gas: 0xd492n,
			maxFeePerGas: 0x4a817c800n,
			maxPriorityFeePerGas: 0n,
			nonce: 0n,
			nonceKey: BigInt(nonceKey),
			validBefore: Number(BigInt(validBefore)),
		})
		const expectedHash = TxEnvelopeTempo.getFeePayerSignPayload(
			equivalentMinedEnvelope,
			{ sender },
		)

		expect(message?.event.feePayerPayloadHash).toBe(expectedHash)
	})

	it('does not build a message for failed or unsigned responses', () => {
		expect(
			buildSponsorshipIntentMessage({
				apiKey,
				fallbackChainId: tempoChain.id,
				requestBody: fillRequest(),
				responseBody: {
					jsonrpc: '2.0',
					id: 1,
					error: { code: -32000, message: 'Sponsorship rejected' },
				},
				sponsorAddress,
			}),
		).toBeNull()

		expect(
			buildSponsorshipIntentMessage({
				apiKey,
				fallbackChainId: tempoChain.id,
				requestBody: {
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_sendRawTransactionSync',
					params: [`0x76${'00'.repeat(80)}`],
				},
				responseBody: {
					jsonrpc: '2.0',
					id: 1,
					result: `0x${'aa'.repeat(32)}`,
				},
				sponsorAddress,
			}),
		).toBeNull()

		expect(
			buildSponsorshipIntentMessage({
				apiKey,
				fallbackChainId: tempoChain.id,
				requestBody: fillRequest(),
				responseBody: fillResponse({ feePayerSignature: undefined }),
				sponsorAddress,
			}),
		).toBeNull()

		expect(
			buildSponsorshipIntentMessage({
				apiKey,
				fallbackChainId: tempoChain.id,
				requestBody: {
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_chainId',
				},
				responseBody: { jsonrpc: '2.0', id: 1, result: '0x1' },
				sponsorAddress,
			}),
		).toBeNull()
	})
})
