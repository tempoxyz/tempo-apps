import type { Address } from 'viem'

export type DiscoveryNode = {
	id: Address
	name: string
	kind: 'contract' | 'native' | 'account'
	depth: number
	isRoot: boolean
}

export type DiscoveryEdge = {
	from: Address
	to: Address
	label: string
	kind: 'getter' | 'proxy' | 'role'
}

export type ContractDiscovery = {
	root: Address
	nodes: DiscoveryNode[]
	edges: DiscoveryEdge[]
	truncated: boolean
}

export async function fetchContractDiscovery(
	address: Address,
): Promise<ContractDiscovery> {
	const response = await fetch(
		`/api/contract-discovery?address=${encodeURIComponent(address)}`,
	)
	if (!response.ok) throw new Error('Contract discovery failed')
	return response.json() as Promise<ContractDiscovery>
}
