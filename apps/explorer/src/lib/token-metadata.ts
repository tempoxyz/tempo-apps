import type { Address } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { Actions } from 'tempo.ts/wagmi'
import { type Log, parseEventLogs } from 'viem'
import { config } from '#wagmi.config'

const abi = Object.values(Abis).flat()

export namespace TokenMetadata {
	export type Metadata = Actions.token.getMetadata.ReturnValue
	export type MetadataMap = Map<Address.Address, Metadata>

	export async function fromLogs(logs: Log[]) {
		const events = parseEventLogs({
			abi,
			logs,
		})

		const tip20Addresses = events
			.filter((event) => event.address.toLowerCase().startsWith('0x20c000000'))
			.map((event) => event.address)
		const metadataResults = await Promise.all(
			tip20Addresses.map((token) =>
				Actions.token.getMetadata(config, { token }),
			),
		)
		const tokenMetadata = new Map<Address.Address, Metadata>()
		for (const [index, address] of tip20Addresses.entries())
			tokenMetadata.set(address, metadataResults[index])

		return tokenMetadata
	}
}
