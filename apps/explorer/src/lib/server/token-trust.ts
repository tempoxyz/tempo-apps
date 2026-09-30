import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import { Addresses } from 'viem/tempo'
import {
	getBlockNumber,
	getChainId,
	readContract,
	readContracts,
} from 'wagmi/actions'
import * as z from 'zod/mini'
import { Abis } from '#lib/abis'
import type { TokenPolicy, TransferPolicy } from '#lib/domain/token-trust'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const inputSchema = z.object({
	token: zAddress(),
	chainId: z.number(),
	account: z.optional(zAddress()),
})

export async function readTokenPolicy(
	input: z.infer<typeof inputSchema>,
): Promise<TokenPolicy> {
	const config = getWagmiConfig()
	if (input.chainId !== getChainId(config))
		throw new Error('Token policy chain mismatch')
	const blockNumber = await getBlockNumber(config)
	const registry = {
		address: Addresses.tip403Registry,
		abi: Abis.tip403Registry,
		blockNumber,
	} as const
	const token = { address: input.token, abi: Abis.tip20, blockNumber } as const
	const policyId = await readContract(config, {
		...token,
		functionName: 'transferPolicyId',
	})
	async function readPolicy(id: bigint): Promise<TransferPolicy> {
		if (id === 0n || id === 1n)
			return {
				id: String(id),
				type: id === 0n ? 'always-reject' : 'always-allow',
				admin: null,
			}
		const [type, admin] = await readContract(config, {
			...registry,
			functionName: 'policyData',
			args: [id],
		})
		if (type !== 0 && type !== 1 && type !== 2)
			throw new Error('Unknown transfer policy type')
		return {
			id: String(id),
			type: type === 0 ? 'allowlist' : type === 1 ? 'blocklist' : 'compound',
			admin:
				type === 2 || /^0x0{40}$/i.test(admin)
					? null
					: (admin as Address.Address),
		}
	}
	const policy = await readPolicy(policyId)
	const scopes = ['Sender', 'Recipient', 'Mint recipient'] as const
	const componentIds =
		policy.type === 'compound'
			? await readContract(config, {
					...registry,
					functionName: 'compoundPolicyData',
					args: [policyId],
				})
			: null
	const components = componentIds
		? await Promise.all(
				componentIds.map(async (id, index) => ({
					...(await readPolicy(id)),
					scope: scopes[index],
				})),
			)
		: []
	const [pauseResult] = await readContracts(config, {
		blockNumber,
		contracts: [
			{ address: input.token, abi: Abis.tip20, functionName: 'paused' },
		],
	})
	const account = input.account
	const checkPolicies = componentIds ?? [policyId, policyId, policyId]
	const results = account
		? await readContracts(config, {
				blockNumber,
				contracts: checkPolicies.map(
					(id) =>
						({
							address: Addresses.tip403Registry,
							abi: Abis.tip403Registry,
							functionName: 'isAuthorized',
							args: [id, account],
						}) as const,
				),
			})
		: null
	return {
		policy,
		components,
		paused: pauseResult.status === 'success' ? pauseResult.result : null,
		blockNumber: String(blockNumber),
		checks: results
			? scopes.map((scope, index) => ({
					scope,
					policyId: String(checkPolicies[index]),
					allowed:
						results[index].status === 'success'
							? (results[index].result as boolean)
							: null,
				}))
			: null,
	}
}

export const fetchTokenPolicy = createServerFn({ method: 'POST' })
	.inputValidator(inputSchema)
	.handler(({ data }) => readTokenPolicy(data))
