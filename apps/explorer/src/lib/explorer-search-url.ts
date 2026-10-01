import * as Address from 'ox/Address'
import { normalizeSearchInput } from './tempo-address'

// Exact hosts only: hostname inference for preview environments is intentionally
// more permissive and must not be used to authorize pasted destinations.
const networks = [
	{
		label: 'Mainnet',
		host: 'explore.tempo.xyz',
		aliases: [
			'explore.4217.tempo.xyz',
			'explore.mainnet.tempo.xyz',
			'explore.presto.tempo.xyz',
		],
	},
	{
		label: 'Testnet',
		host: 'explore.testnet.tempo.xyz',
		aliases: ['explore.42431.tempo.xyz', 'explore.moderato.tempo.xyz'],
	},
	{
		label: 'Devnet',
		host: 'explore.devnet.tempo.xyz',
		aliases: ['explore.31318.tempo.xyz'],
	},
	{ label: 'Nextfork', host: 'explore.nextfork.devnet.tempo.xyz', aliases: [] },
	{
		label: 'Zone Prover',
		host: 'explore.zone-prover.devnet.tempo.xyz',
		aliases: [],
	},
]

export function parseExplorerSearchUrl(
	input: string,
): { href: string; network: string } | undefined {
	try {
		const url = new URL(input.trim())
		if (url.protocol !== 'https:' || url.username || url.password || url.port)
			return undefined
		const network = networks.find(
			({ host, aliases }) =>
				url.hostname === host || aliases.includes(url.hostname),
		)
		if (!network) return undefined
		const match = /^\/(address|token|tx|receipt|block)\/([^/]+)\/?$/.exec(
			url.pathname,
		)
		if (!match) return undefined
		const [, resource, encodedId] = match
		let id = decodeURIComponent(encodedId)
		if (resource === 'address' || resource === 'token') {
			id = normalizeSearchInput(id)
			if (!Address.validate(id)) return undefined
		} else if (resource === 'block') {
			if (id !== 'latest' && !/^0x[0-9a-fA-F]{64}$/.test(id)) {
				if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)))
					return undefined
				id = String(Number(id))
			}
		} else if (!/^0x[0-9a-fA-F]{64}$/.test(id)) return undefined
		return {
			href: `https://${network.host}/${resource}/${id}`,
			network: network.label,
		}
	} catch {
		return undefined
	}
}
