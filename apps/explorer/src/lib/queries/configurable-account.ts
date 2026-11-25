import { queryOptions } from '@tanstack/react-query'
import * as Address from 'ox/Address'
import type * as Hex from 'ox/Hex'
import { encodeEventTopics, pad, parseAbiItem } from 'viem'
import {
	CONFIGURABLE_ACCOUNT_PRECOMPILE,
	configurableAccountAbi,
	configurableAccountView,
	type OwnerKind,
	ownerKindsFromTransaction,
	parseConfigUpdates,
} from '#lib/domain/configurable-account'
import { getWagmiConfig } from '#wagmi.config.ts'

const transferEvent = parseAbiItem(
	'event Transfer(address indexed from, address indexed to, uint256 amount)',
)

/** Recent sends to read owner key types from, besides config updates. */
const MAX_SIGNED_TRANSACTIONS = 25

/**
 * A configurable account's config history from the precompile's events
 * (`eth_getLogs`, no indexer), with owner key types read from the
 * approvals of transactions it signed: its config updates and its recent
 * TIP-20 sends. `null` when the address isn't a configurable account.
 */
export async function fetchConfigurableAccount(address: Address.Address) {
	const client = getWagmiConfig().getClient()
	const accountTopic = pad(address.toLowerCase() as Hex.Hex, { size: 32 })
	const [updated, upgraded] = ['ConfigurableAccountConfigUpdated', 'AccountUpgraded'].map(
		(eventName) =>
			encodeEventTopics({
				abi: configurableAccountAbi,
				eventName: eventName as 'AccountUpgraded',
			})[0] as Hex.Hex,
	)
	const logs = await client.request({
		method: 'eth_getLogs',
		params: [
			{
				address: CONFIGURABLE_ACCOUNT_PRECOMPILE,
				topics: [[updated as Hex.Hex, upgraded as Hex.Hex], accountTopic],
				fromBlock: '0x0',
				toBlock: 'latest',
			},
		],
	})
	const updates = parseConfigUpdates(
		logs.map((log) => ({ ...log, data: log.data as Hex.Hex })),
	)
	if (updates.length === 0) return null

	const transferTopic = encodeEventTopics({
		abi: [transferEvent],
		eventName: 'Transfer',
	})[0]
	const sends = await client
		.request({
			method: 'eth_getLogs',
			params: [
				{
					topics: [transferTopic, accountTopic],
					fromBlock: `0x${updates[0]?.blockNumber.toString(16) ?? '0'}`,
					toBlock: 'latest',
				},
			],
		})
		.catch(() => [])
	const hashes = [
		...new Set([
			...updates.map((update) => update.transactionHash),
			...sends
				.map((log) => log.transactionHash)
				.filter((hash): hash is Hex.Hex => Boolean(hash))
				.reverse()
				.slice(0, MAX_SIGNED_TRANSACTIONS),
		]),
	]
	const kinds = new Map<string, OwnerKind>()
	const raws = await Promise.all(
		hashes.map((hash) =>
			(
				client.request({
					method: 'eth_getRawTransactionByHash',
					params: [hash],
				} as never) as Promise<Hex.Hex | null>
			).catch(() => null),
		),
	)
	for (const raw of raws) {
		if (!raw) continue
		for (const [owner, kind] of ownerKindsFromTransaction(raw, address))
			kinds.set(owner, kind)
	}
	return configurableAccountView(updates, kinds) ?? null
}

export function configurableAccountQueryOptions(address: Address.Address) {
	return queryOptions({
		queryKey: ['configurable-account', Address.checksum(address)],
		queryFn: () => fetchConfigurableAccount(address),
		staleTime: 5_000,
		retry: false,
	})
}
