import type { Address } from 'ox'
import type { Log } from 'viem'
import { parseEventLogs } from 'viem'
import { readContract, readContracts } from 'wagmi/actions'
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

export async function fetchLogoURIs(
	config: Config,
	tokens: Address.Address[],
): Promise<Map<string, string>> {
	if (tokens.length === 0) return new Map()

	const results = await readContracts(config, {
		contracts: tokens.map((token) => ({
			address: token,
			abi: logoUriAbi,
			functionName: 'logoURI',
		})),
	}).catch(() => [])

	const logoURIs = new Map<string, string>()
	for (const [index, result] of results.entries()) {
		const logoURI = result.result
		if (typeof logoURI === 'string' && logoURI.trim()) {
			logoURIs.set(tokens[index].toLowerCase(), logoURI)
		}
	}
	return logoURIs
}

export async function metadataFromLogs(
	logs: Log[],
): Promise<GetTip20MetadataFn> {
	const events = parseEventLogs({ abi, logs })

	const tip20Addresses = events
		.map(({ address }) => address)
		.filter(isTip20Address)

	const config = getWagmiConfig()

	// TODO: investigate & consider batch/multicall
	const metadataResults = await Promise.all(
		tip20Addresses.map((token) =>
			Actions.token.getMetadata(config as Config, { token }),
		),
	)
	const map = new Map<string, Metadata>()
	for (const [index, address] of tip20Addresses.entries())
		map.set(address.toLowerCase(), metadataResults[index])

	return (address: Address.Address) => map.get(address.toLowerCase())
}
