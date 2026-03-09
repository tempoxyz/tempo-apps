import * as z from 'zod/mini'
import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

import { app } from '#index.tsx'

describe('POST /v2/verify/:chainId/:address', () => {
	const validBody = {
		stdJsonInput: {
			language: 'Solidity',
			settings: {
				optimizer: { enabled: true, runs: 200 },
				outputSelection: {
					'*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] },
				},
			},
			sources: {
				'contracts/Token.sol': {
					content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Token {
    string public name = "Test";
}`,
				},
			},
		},
		compilerVersion: '0.8.20',
		contractIdentifier: 'contracts/Token.sol:Token',
	}

	it('returns 400 for invalid chain ID', async () => {
		const response = await app.request(
			'/v2/verify/999999/0x1234567890123456789012345678901234567890',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
			env,
		)

		expect(response.status).toBe(400)
	})

	it('returns 400 for invalid address format', async () => {
		const response = await app.request(
			'/v2/verify/1/invalid-address',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validBody),
			},
			env,
		)

		expect(response.status).toBe(400)
	})

	it('returns 400 for invalid JSON body', async () => {
		const response = await app.request(
			'/v2/verify/1/0x1234567890123456789012345678901234567890',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not valid json',
			},
			env,
		)

		expect(response.status).toBe(400)
	})

	it('returns 400 for missing required fields', async () => {
		const response = await app.request(
			'/v2/verify/1/0x1234567890123456789012345678901234567890',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					compilerVersion: '0.8.20',
					contractIdentifier: 'Token',
				}),
			},
			env,
		)

		expect(response.status).toBe(400)
	})
})

describe('POST /metadata/:chainId/:address', () => {
	it('returns 501 not implemented', async () => {
		const response = await app.request(
			'/v2/verify/metadata/1/0x1234567890123456789012345678901234567890',
			{ method: 'POST' },
			env,
		)

		expect(response.status).toBe(501)

		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('not_implemented')
	})
})

describe('POST /similarity/:chainId/:address', () => {
	it('returns 501 not implemented', async () => {
		const response = await app.request(
			'/v2/verify/similarity/1/0x1234567890123456789012345678901234567890',
			{ method: 'POST' },
			env,
		)

		expect(response.status).toBe(501)

		const body = z.parse(
			z.object({ customCode: z.string() }),
			await response.json(),
		)
		expect(body.customCode).toBe('not_implemented')
	})
})
