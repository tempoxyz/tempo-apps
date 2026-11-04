import type { Client } from 'viem'
import { hexToBigInt } from 'viem'

/**
 * The chain head from a server client, read with a plain `eth_blockNumber`.
 *
 * Server clients are per request (see `getWagmiConfig`), and viem's
 * `getBlockNumber` keeps its last answer in a module-global map keyed by the
 * client's `uid` that nothing ever evicts, so calling it on them would leave
 * one entry per request in the isolate.
 */
export async function readBlockNumber(client: {
	request: Client['request']
}): Promise<bigint> {
	return hexToBigInt(await client.request({ method: 'eth_blockNumber' }))
}
