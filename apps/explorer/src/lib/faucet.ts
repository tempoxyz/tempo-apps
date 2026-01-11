import type { Address, Client, Hash } from 'viem'

export async function fundAddress(
	client: Client,
	address: Address,
): Promise<Hash[]> {
	// tempo_fundAddress is a custom Tempo RPC method not in viem's standard types
	const txHashes = await (
		client.request as (args: {
			method: string
			params: [Address]
		}) => Promise<Hash[]>
	)({
		method: 'tempo_fundAddress',
		params: [address],
	})
	return txHashes
}
