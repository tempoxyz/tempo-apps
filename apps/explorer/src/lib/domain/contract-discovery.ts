import type { Address } from 'viem'

export type DiscoveryNode = {
	id: Address
	name: string
	kind: 'contract' | 'native' | 'account'
	depth: number
	isRoot: boolean
	details: DiscoveryNodeDetails
}

export type DiscoveryNodeDetails = {
	bytecode: {
		status: 'available' | 'empty' | 'unavailable' | 'precompile'
		bytes?: number
	}
	abi?: DiscoveryAbiSummary
	source?: DiscoverySourceSummary
	proxy?: {
		implementation?: Address
		admin?: Address
	}
}

export type DiscoveryAbiSummary = {
	functionCount: number
	readFunctionCount: number
	writeFunctionCount: number
	eventCount: number
	errorCount: number
	functions: Array<{
		name: string
		stateMutability: string
		inputs: number
		outputs: number
	}>
	truncated: boolean
}

export type DiscoverySourceSummary = {
	kind: 'verified' | 'native'
	name: string
	language: string
	compiler?: string
	compilerVersion?: string
	fullyQualifiedName?: string
	verifiedAt?: string | null
	match?: string | null
	runtimeMatch?: string | null
	sourceFileCount: number
	docsUrl?: string
	repository?: string
	commit?: string
	commitUrl?: string | null
	entrypoints?: string[]
}

export type DiscoveryEdge = {
	from: Address
	to: Address
	label: string
	kind: 'getter' | 'proxy' | 'role'
}

export type ContractDiscovery = {
	root: Address
	chainId: number
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
