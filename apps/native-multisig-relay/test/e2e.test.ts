import { env, exports } from 'cloudflare:workers'
import { Mnemonic } from 'ox'
import { createClient, http, parseUnits } from 'viem'
import {
	prepareTransactionRequest,
	sendTransaction,
	waitForTransactionReceipt,
} from 'viem/actions'
import { Account, Actions } from 'viem/tempo'
import { beforeAll, describe, expect, it } from 'vitest'
import {
	feeToken,
	multisigRelayTransport,
	recipient,
	sponsorAddress,
	tempoChain,
	testMnemonic,
} from './helpers.js'

const supportsNativeMultisig =
	typeof (Account as unknown as { fromMultisig?: unknown }).fromMultisig ===
	'function'
const nativeDescribe = supportsNativeMultisig ? describe : describe.skip

describe('native multisig relay Worker', () => {
	it('proxies eth_chainId', async () => {
		const response = await exports.default.fetch(
			new Request('https://native-multisig-relay.test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_chainId',
				}),
			}),
		)

		expect(response.status).toBe(200)
		const data = (await response.json()) as { result?: string }
		expect(data.result).toBeDefined()
	})

	it('does not implement eth_signTransaction server-side', async () => {
		const response = await exports.default.fetch(
			new Request('https://native-multisig-relay.test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'eth_signTransaction',
					params: [{ to: recipient.address }],
				}),
			}),
		)

		expect(response.status).toBe(200)
		const data = (await response.json()) as {
			error?: { code: number; message?: string; name?: string }
		}
		expect(data.error).toBeDefined()
	})
})

nativeDescribe('native multisig relay e2e', () => {
	const sponsorAccount = Account.fromSecp256k1(
		Mnemonic.toPrivateKey(testMnemonic, {
			as: 'Hex',
			path: Mnemonic.path({ account: 0 }),
		}),
	)
	const owner_1 = Account.fromSecp256k1(
		Mnemonic.toPrivateKey(testMnemonic, {
			as: 'Hex',
			path: Mnemonic.path({ account: 1 }),
		}),
	)
	const owner_2 = Account.fromSecp256k1(
		Mnemonic.toPrivateKey(testMnemonic, {
			as: 'Hex',
			path: Mnemonic.path({ account: 2 }),
		}),
	)
	const account = (
		Account as unknown as {
			fromMultisig: (config: {
				threshold: number
				owners: readonly { owner: `0x${string}`; weight: number }[]
			}) => ReturnType<typeof Account.fromSecp256k1>
		}
	).fromMultisig({
		threshold: 2,
		owners: [
			{ owner: owner_1.address, weight: 1 },
			{ owner: owner_2.address, weight: 1 },
		],
	})
	const rpc = createClient({
		account: sponsorAccount,
		chain: tempoChain,
		transport: http(env.TEMPO_RPC_URL),
	})
	const client = createClient({
		account,
		chain: tempoChain,
		transport: multisigRelayTransport('/'),
	})

	beforeAll(async () => {
		await Actions.token.transferSync(rpc, {
			account: sponsorAccount,
			amount: parseUnits('10', 6),
			feeToken,
			nonceKey: 'native-multisig-relay-e2e',
			to: account.address,
			token: feeToken,
		})
	})

	it('collects approvals in KV and broadcasts at quorum', async () => {
		const request = {
			...(await prepareTransactionRequest(client, {
				account,
				calls: [
					{
						to: recipient.address,
						value: 0n,
					},
				],
				feeToken,
			} as never)),
			gas: 650_000n,
		}
		const signature_1 = await owner_1.signTransaction({
			...request,
			account: owner_1,
		} as never)
		const signature_2 = await owner_2.signTransaction({
			...request,
			account: owner_2,
		} as never)
		const id = await sendTransaction(client, {
			...request,
			signatures: [signature_1],
		} as never)
		const pendingReceipt = await client.request({
			method: 'eth_getTransactionReceipt',
			params: [id],
		})

		expect(id).toMatch(/^0x[a-fA-F0-9]{64}$/)
		expect(pendingReceipt).toBeNull()

		const hash = await sendTransaction(client, {
			...request,
			signatures: [signature_2],
		} as never)
		const receipt = await waitForTransactionReceipt(rpc, { hash })

		expect(receipt.transactionHash).toBe(hash)
		expect(receipt.from.toLowerCase()).toBe(account.address.toLowerCase())
		expect(
			(receipt as { feePayer?: string | undefined }).feePayer?.toLowerCase(),
		).toBe(sponsorAddress.toLowerCase())
		expect(receipt.status).toBe('success')
	})
})
