import { env, SELF } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Hex } from 'ox'
import { describe, expect, it } from 'vitest'

import { verificationJobsTable } from '#database/schema.ts'

const testBytecode = {
	runtime: '0x6000600055',
	creation: '0x60006000556000',
} as const

const fakeCompileOutput = {
	contracts: {
		'Simple.sol': {
			Simple: {
				abi: [
					{
						type: 'function',
						name: 'setValue',
						inputs: [{ type: 'uint256', name: 'value' }],
					},
				],
				evm: {
					bytecode: {
						object: testBytecode.creation,
						sourceMap: '',
						linkReferences: {},
					},
					deployedBytecode: {
						object: testBytecode.runtime,
						sourceMap: '',
						linkReferences: {},
						immutableReferences: {},
					},
				},
				metadata: '{}',
			},
		},
	},
}

describe('runVerificationJob', () => {
	const chainId = env.TEST_CHAIN_ID
	const address = '0x1234567890123456789012345678901234567890' as const

	it('completes a verification job and exposes contract data via GET', async () => {
		const db = drizzle(env.CONTRACTS_DB)
		const jobId = globalThis.crypto.randomUUID()

		await db.insert(verificationJobsTable).values({
			id: jobId,
			chainId,
			contractAddress: Hex.toBytes(address),
			verificationEndpoint: '/v2/verify',
		})

		const { runVerificationJob } = await import('#route.verify.ts')
		await runVerificationJob(
			env,
			jobId,
			chainId,
			address,
			{
				stdJsonInput: {
					language: 'Solidity',
					sources: {
						'Simple.sol': { content: 'contract Simple { }' },
					},
					settings: {},
				},
				compilerVersion: '0.8.20',
				contractIdentifier: 'Simple.sol:Simple',
			},
			{
				createPublicClient: () => ({
					getCode: async () => testBytecode.runtime,
				}),
				getContainer: () => ({
					fetch: async () =>
						new Response(JSON.stringify(fakeCompileOutput), {
							status: 200,
							headers: { 'Content-Type': 'application/json' },
						}),
				}),
			},
		)

		const job = await db
			.select()
			.from(verificationJobsTable)
			.where(eq(verificationJobsTable.id, jobId))
			.then((rows) => rows[0])

		expect(job?.completedAt).not.toBeNull()
		expect(job?.errorCode).toBeNull()
		expect(job?.verifiedContractId).not.toBeNull()

		const response = await SELF.fetch(`http://localhost/v2/verify/${jobId}`)

		expect(response.status).toBe(200)
		const body = (await response.json()) as {
			isJobCompleted: boolean
			contract: { address: string; name: string }
		}
		expect(body.isJobCompleted).toBe(true)
		expect(body.contract.address.toLowerCase()).toBe(address.toLowerCase())
		expect(body.contract.name).toBe('Simple')
	})
})
