import type { Address } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { Actions } from 'tempo.ts/wagmi'
import { type Log, parseEventLogs } from 'viem'
import { config } from '#wagmi.config'

const abi = Object.values(Abis).flat()

const tip20Prefix = '0x20c000000'
export type Tip20Address = `${typeof tip20Prefix}${string}`
export function isTip20Address(address: string): address is Tip20Address {
	return address.toLowerCase().startsWith(tip20Prefix)
}

export type Metadata = Actions.token.getMetadata.ReturnValue

export type GetTip20MetadataFn = (
	address: Address.Address,
) => Metadata | undefined

export async function metadataFromLogs(
	logs: Log[],
): Promise<GetTip20MetadataFn> {
	const events = parseEventLogs({ abi, logs })

	const tip20Addresses = events
		.map(({ address }) => address)
		.filter(isTip20Address)

	const metadataResults = await Promise.all(
		tip20Addresses.map((token) => Actions.token.getMetadata(config, { token })),
	)
	const map = new Map<string, Metadata>()
	for (const [index, address] of tip20Addresses.entries())
		map.set(address.toLowerCase(), metadataResults[index])

	return (address: Address.Address) => map.get(address.toLowerCase())
}
