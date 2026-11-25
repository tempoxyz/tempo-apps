import { queryOptions } from '@tanstack/react-query'
import type * as Address from 'ox/Address'
import type * as Hex from 'ox/Hex'
import { withImmutableDataCache } from '#lib/server/immutable-data-cache'
import { getTempoChain, getWagmiConfig } from '#wagmi.config.ts'

export type TxSignatureData = {
	/** EIP-2718 bytes of the signed transaction. */
	raw: Hex.Hex
	/** Whether the sender had no nonce and no code before this block. */
	senderWasEmpty: boolean
}

async function fetchTxSignatureDataUncached(params: {
	hash: Hex.Hex
	from: Address.Address
	blockNumber: bigint
}): Promise<TxSignatureData | null> {
	const client = getWagmiConfig().getClient()
	const parent = `0x${(params.blockNumber > 0n ? params.blockNumber - 1n : 0n).toString(16)}` as Hex.Hex
	const [raw, nonce, code] = await Promise.all([
		client.request({
			method: 'eth_getRawTransactionByHash',
			params: [params.hash],
		} as never) as Promise<Hex.Hex | null>,
		client.request({
			method: 'eth_getTransactionCount',
			params: [params.from, parent],
		}),
		client.request({ method: 'eth_getCode', params: [params.from, parent] }),
	])
	if (!raw) return null
	return {
		raw,
		senderWasEmpty: BigInt(nonce) === 0n && (code === '0x' || code === '0x0'),
	}
}

/** What the signature view needs beyond the transaction and its receipt. */
export function txSignaturesQueryOptions(params: {
	hash: Hex.Hex
	from: Address.Address
	blockNumber: bigint
}) {
	return queryOptions({
		queryKey: ['tx-signatures', params.hash],
		queryFn: () =>
			withImmutableDataCache({
				key: `tx-signatures:v1:${getTempoChain().id}:${params.hash.toLowerCase()}`,
				load: () => fetchTxSignatureDataUncached(params),
				shouldCache: (data) => data !== null,
			}),
		staleTime: Number.POSITIVE_INFINITY,
		retry: 1,
	})
}
