import type { Address } from 'ox'
import type { Log } from 'viem'
import { parseEventLogs } from 'viem'
import { readContract } from 'wagmi/actions'
import { Abis } from '#lib/abis'
import { Actions } from 'wagmi/tempo'
import type { Config } from 'wagmi'
import { getWagmiConfig } from '#wagmi.config.ts'

const abi = Object.values(Abis).flat()

const tip20Prefix = '0x20c000000'
export type Tip20Address = `${typeof tip20Prefix}${string}`
export function isTip20Address(address: string): address is Tip20Address {
	return address.toLowerCase().startsWith(tip20Prefix)
}

export type Metadata = Actions.token.getMetadata.ReturnValue

/** Display names that replace a token's onchain `name()`, keyed by lowercased address. */
const nameOverrides: Record<string, string> = {
	// OUSD
	'0x20c0000000000000000000006a37da5c996874be': 'Open USD',
}

/** Returns the display name for a token, preferring any explorer override. */
export function resolveName(address: string, name: string): string {
	return nameOverrides[address.toLowerCase()] ?? name
}

/** Applies any explorer name override to token metadata. */
export function withNameOverride<metadata extends { name: string }>(
	address: string,
	metadata: metadata,
): metadata {
	const name = nameOverrides[address.toLowerCase()]
	return name ? { ...metadata, name } : metadata
}

export type GetTip20MetadataFn = (
	address: Address.Address,
) => Metadata | undefined

export const logoUriAbi = [
	{
		type: 'function',
		name: 'logoURI',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ type: 'string' }],
	},
] as const

export function resolveLogoURI(logoURI: string | null | undefined) {
	if (!logoURI) return undefined
	const trimmed = logoURI.trim()
	if (!trimmed) return undefined

	if (trimmed.startsWith('ipfs://')) {
		const path = trimmed.slice('ipfs://'.length).replace(/^ipfs\//, '')
		if (!path) return undefined
		return `https://ipfs.io/ipfs/${path}`
	}

	return trimmed
}

export async function fetchLogoURI(
	config: Config,
	token: Address.Address,
): Promise<string | undefined> {
	const logoURI = await readContract(config, {
		address: token,
		abi: logoUriAbi,
		functionName: 'logoURI',
	}).catch(() => undefined)

	return typeof logoURI === 'string' ? logoURI : undefined
}

export async function metadataFromLogs(
	logs: Log[],
): Promise<GetTip20MetadataFn> {
	const events = parseEventLogs({ abi, logs })

	const tip20Addresses = events
		.map(({ address }) => address)
		.filter(isTip20Address)
	return metadataForTokens(tip20Addresses)
}

export async function metadataForTokens(
	tokens: Address.Address[],
): Promise<GetTip20MetadataFn> {
	const tip20Addresses = [
		...new Map(
			tokens
				.filter(isTip20Address)
				.map((address) => [address.toLowerCase(), address]),
		).values(),
	]

	const config = getWagmiConfig()

	// TODO: investigate & consider batch/multicall
	const metadataResults = await Promise.all(
		tip20Addresses.map((token) =>
			Actions.token.getMetadata(config as Config, { token }),
		),
	)
	const map = new Map<string, Metadata>()
	for (const [index, address] of tip20Addresses.entries())
		map.set(
			address.toLowerCase(),
			withNameOverride(address, metadataResults[index]),
		)

	return (address: Address.Address) => map.get(address.toLowerCase())
}
