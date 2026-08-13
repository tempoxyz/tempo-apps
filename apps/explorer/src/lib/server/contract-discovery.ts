import * as Address from 'ox/Address'
import * as Hash from 'ox/Hash'
import * as Hex from 'ox/Hex'
import {
	type Abi,
	type AbiFunction,
	type Chain,
	createPublicClient,
	http,
	parseAbiItem,
	type PublicClient,
	type Transport,
	zeroAddress,
} from 'viem'
import { Abis } from '#lib/abis'
import type {
	ContractDiscovery,
	DiscoveryEdge,
	DiscoveryNode,
} from '#lib/domain/contract-discovery'
import type { ContractSource } from '#lib/domain/contract-source'
import { fetchContractSourceDirect } from '#lib/domain/contract-source'
import * as Tip20 from '#lib/domain/tip20'
import { tempoQueryBuilder } from '#lib/server/tempo-queries-provider'
import { getTempoChain } from '#wagmi.config'

const MAX_NODES = 32
const MAX_DEPTH = 4
const MAX_GETTERS_PER_CONTRACT = 80
const ROLE_LOG_SCAN_LIMIT = 10_000
const ROLE_EVENT = Hash.keccak256(
	Hex.fromString('RoleMembershipUpdated(bytes32,address,address,bool)'),
)
const ISSUER_ROLE = Hash.keccak256(Hex.fromString('ISSUER_ROLE'))
const ROLE_EVENT_ABI = parseAbiItem(
	'event RoleMembershipUpdated(bytes32 indexed role, address indexed account, address indexed sender, bool hasRole)',
)
const IMPLEMENTATION_SLOT =
	'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const ADMIN_SLOT =
	'0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'

type QueueItem = { address: Address.Address; depth: number }

export async function discoverContractGraph(
	root: Address.Address,
): Promise<ContractDiscovery> {
	const chain = getTempoChain()
	const client = createPublicClient({
		chain,
		transport: http(chain.rpcUrls.default.http[0]),
	})
	const queue: QueueItem[] = [{ address: Address.checksum(root), depth: 0 }]
	const seen = new Set<string>()
	const queued = new Set([root.toLowerCase()])
	const nodes: DiscoveryNode[] = []
	const edges: DiscoveryEdge[] = []
	const deadline = Date.now() + 25_000
	let incomplete = false

	while (
		queue.length > 0 &&
		nodes.length < MAX_NODES &&
		Date.now() < deadline
	) {
		const current = queue.shift()
		if (!current) break
		const key = current.address.toLowerCase()
		if (seen.has(key)) continue
		seen.add(key)

		const isNative = Tip20.isTip20Address(current.address)
		let abi: Abi | undefined
		let name: string | undefined

		if (isNative) {
			abi = Abis.tip20
		}

		const [source, bytecode] = await Promise.all([
			isNative
				? Promise.resolve(undefined)
				: withTimeout(
						fetchContractSourceDirect({
							address: current.address,
							chainId: chain.id,
						}),
						3_000,
					).catch(() => undefined),
			isNative
				? Promise.resolve(undefined)
				: withTimeout(
						client.getCode({ address: current.address }),
						3_000,
					).catch(() => undefined),
		])
		if (source) {
			abi = source.abi as Abi
			name = source.kind === 'native' ? source.name : source.compilation.name
		}
		const hasVerifiedSource = source !== undefined
		const isContract =
			isNative ||
			hasVerifiedSource ||
			(bytecode !== undefined && bytecode !== '0x')

		const node: DiscoveryNode = {
			id: current.address,
			name: name ?? fallbackName(current.address, isNative, isContract),
			kind: isNative ? 'native' : isContract ? 'contract' : 'account',
			depth: current.depth,
			isRoot: current.depth === 0,
			details: buildNodeDetails({
				abi,
				bytecode,
				isNative,
				source,
			}),
		}

		if (!isContract || current.depth >= MAX_DEPTH) {
			nodes.push(node)
			continue
		}

		const found: DiscoveryEdge[] = []
		if (isNative) {
			const roleResult = await currentTip20Issuers(
				current.address,
				chain.id,
				client,
			)
			if (!roleResult.complete) incomplete = true
			for (const issuer of roleResult.issuers) {
				found.push({
					from: current.address,
					to: issuer,
					action: 'needs approval from',
					label: 'ISSUER_ROLE',
					kind: 'role',
				})
			}
		}

		if (abi) {
			const getters = abi
				.filter(isAddressGetter)
				.slice(0, MAX_GETTERS_PER_CONTRACT)
			const results = await Promise.all(
				getters.map((getter) =>
					withTimeout(
						client.readContract({
							address: current.address,
							abi: [getter],
							functionName: getter.name,
						}),
						3_000,
					).then(
						(result) => ({ getter, result }),
						() => undefined,
					),
				),
			)
			for (const entry of results) {
				if (!entry) continue
				const { getter, result } = entry
				for (const target of extractAddresses(result)) {
					found.push({
						from: current.address,
						to: target,
						action: describeGetterAction(getter.name),
						label: getter.name,
						kind: 'getter',
					})
				}
			}
		}

		if (!isNative) {
			for (const [label, slot] of [
				['$implementation', IMPLEMENTATION_SLOT],
				['$admin', ADMIN_SLOT],
			] as const) {
				try {
					const value = await withTimeout(
						client.getStorageAt({ address: current.address, slot }),
						3_000,
					)
					const target = storageAddress(value)
					if (target) {
						const proxy = node.details.proxy ?? {}
						proxy[label === '$implementation' ? 'implementation' : 'admin'] =
							target
						node.details.proxy = proxy
						found.push({
							from: current.address,
							to: target,
							action:
								label === '$implementation'
									? 'runs code from'
									: 'is controlled by',
							label,
							kind: 'proxy',
						})
					}
				} catch {
					// Some RPC transports do not expose storage reads.
				}
			}
		}
		nodes.push(node)

		for (const edge of dedupeEdges(found)) {
			edges.push(edge)
			const targetKey = edge.to.toLowerCase()
			if (!seen.has(targetKey) && !queued.has(targetKey)) {
				queued.add(targetKey)
				queue.push({ address: edge.to, depth: current.depth + 1 })
			}
		}
	}

	return {
		root: Address.checksum(root),
		chainId: chain.id,
		nodes,
		edges: edges.filter(
			(edge) =>
				nodes.some(
					(node) => node.id.toLowerCase() === edge.from.toLowerCase(),
				) &&
				nodes.some((node) => node.id.toLowerCase() === edge.to.toLowerCase()),
		),
		truncated: incomplete || queue.length > 0,
	}
}

function buildNodeDetails(props: {
	abi?: Abi
	bytecode?: Hex.Hex
	isNative: boolean
	source?: ContractSource
}): DiscoveryNode['details'] {
	const { abi, bytecode, isNative, source } = props
	return {
		bytecode: {
			status: isNative
				? 'precompile'
				: bytecode === undefined
					? 'unavailable'
					: bytecode === '0x'
						? 'empty'
						: 'available',
			...(bytecode && bytecode !== '0x'
				? { bytes: (bytecode.length - 2) / 2 }
				: {}),
		},
		...(abi ? { abi: summarizeAbi(abi) } : {}),
		...(source ? { source: summarizeSource(source) } : {}),
	}
}

function summarizeAbi(abi: Abi) {
	const functions = abi.filter(
		(item): item is AbiFunction => item.type === 'function',
	)
	const reads = functions.filter(
		(item) =>
			item.stateMutability === 'view' || item.stateMutability === 'pure',
	)
	const writes = functions.filter(
		(item) =>
			item.stateMutability === 'nonpayable' ||
			item.stateMutability === 'payable',
	)
	const maxFunctions = 100

	return {
		functionCount: functions.length,
		readFunctionCount: reads.length,
		writeFunctionCount: writes.length,
		eventCount: abi.filter((item) => item.type === 'event').length,
		errorCount: abi.filter((item) => item.type === 'error').length,
		functions: functions.slice(0, maxFunctions).map((item) => ({
			name: item.name,
			stateMutability: item.stateMutability,
			inputs: item.inputs.length,
			outputs: item.outputs.length,
		})),
		truncated: functions.length > maxFunctions,
	}
}

function summarizeSource(source: ContractSource) {
	if (source.kind === 'native') {
		return {
			kind: source.kind,
			name: source.name,
			language: source.nativeSource.language,
			verifiedAt: source.verifiedAt,
			match: source.match,
			runtimeMatch: source.runtimeMatch,
			sourceFileCount: Object.keys(source.sources).length,
			...(source.docsUrl ? { docsUrl: source.docsUrl } : {}),
			repository: source.nativeSource.repository,
			commit: source.nativeSource.commit,
			commitUrl: source.nativeSource.commitUrl,
			entrypoints: source.nativeSource.entrypoints,
		}
	}

	return {
		kind: source.kind,
		name: source.compilation.name,
		language: source.compilation.language,
		compiler: source.compilation.compiler,
		compilerVersion: source.compilation.compilerVersion,
		fullyQualifiedName: source.compilation.fullyQualifiedName,
		verifiedAt: source.verifiedAt,
		match: source.match,
		runtimeMatch: source.runtimeMatch,
		sourceFileCount: Object.keys(source.stdJsonInput.sources).length,
	}
}

function isAddressGetter(item: Abi[number]): item is AbiFunction {
	return (
		item.type === 'function' &&
		(item.stateMutability === 'view' || item.stateMutability === 'pure') &&
		item.inputs.length === 0 &&
		item.outputs.length === 1 &&
		(item.outputs[0]?.type === 'address' ||
			item.outputs[0]?.type === 'address[]')
	)
}

function extractAddresses(value: unknown): Address.Address[] {
	const values = Array.isArray(value) ? value : [value]
	return values.flatMap((candidate) => {
		if (typeof candidate !== 'string' || !Address.validate(candidate)) return []
		if (candidate.toLowerCase() === zeroAddress) return []
		return [Address.checksum(candidate)]
	})
}

function storageAddress(
	value: Hex.Hex | undefined,
): Address.Address | undefined {
	if (!value || value === '0x') return undefined
	const candidate = `0x${value.slice(-40)}`
	if (!Address.validate(candidate) || candidate.toLowerCase() === zeroAddress)
		return undefined
	return Address.checksum(candidate)
}

async function currentTip20Issuers<
	TTransport extends Transport,
	TChain extends Chain | undefined,
>(
	address: Address.Address,
	chainId: number,
	client: PublicClient<TTransport, TChain>,
): Promise<{ issuers: Address.Address[]; complete: boolean }> {
	try {
		const query = tempoQueryBuilder(chainId, { engine: 'clickhouse' })
			.selectFrom('logs')
			.select(['topic1', 'topic2', 'data', 'block_num', 'log_idx'])
			.where('address', '=', address.toLowerCase() as Address.Address)
			.where('selector', '=', ROLE_EVENT)
			.orderBy('block_num', 'asc')
			.orderBy('log_idx', 'asc')
			.limit(ROLE_LOG_SCAN_LIMIT)
			.execute()
		const logs = await withTimeout(query, 4_000)
		const current = new Map<Address.Address, boolean>()
		for (const log of logs) {
			if (log.topic1?.toLowerCase() !== ISSUER_ROLE.toLowerCase()) continue
			if (!log.topic2 || !log.data) continue
			const account = Address.checksum(`0x${log.topic2.slice(-40)}`)
			current.set(account, Hex.toBigInt(log.data) !== 0n)
		}
		return {
			issuers: [...current]
				.filter(([, active]) => active)
				.map(([account]) => account),
			complete: true,
		}
	} catch {
		return currentTip20IssuersFromRpc(address, client)
	}
}

async function currentTip20IssuersFromRpc<
	TTransport extends Transport,
	TChain extends Chain | undefined,
>(
	address: Address.Address,
	client: PublicClient<TTransport, TChain>,
): Promise<{ issuers: Address.Address[]; complete: boolean }> {
	try {
		const latest = await withTimeout(client.getBlockNumber(), 3_000)
		const first = latest > 1_000_000n ? latest - 1_000_000n : 0n
		const ranges: { fromBlock: bigint; toBlock: bigint }[] = []
		for (let fromBlock = first; fromBlock <= latest; fromBlock += 100_000n) {
			ranges.push({
				fromBlock,
				toBlock: fromBlock + 99_999n < latest ? fromBlock + 99_999n : latest,
			})
		}
		const logs = (
			await withTimeout(
				Promise.all(
					ranges.map((range) =>
						client.getLogs({ address, event: ROLE_EVENT_ABI, ...range }),
					),
				),
				8_000,
			)
		).flat()
		const current = new Map<Address.Address, boolean>()
		for (const log of logs) {
			if (log.args.role?.toLowerCase() !== ISSUER_ROLE.toLowerCase()) continue
			if (!log.args.account || log.args.hasRole === undefined) continue
			current.set(Address.checksum(log.args.account), log.args.hasRole)
		}
		return {
			issuers: [...current]
				.filter(([, active]) => active)
				.map(([account]) => account),
			complete: true,
		}
	} catch {
		return { issuers: [], complete: false }
	}
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(new Error('Timed out')), timeoutMs)
			}),
		])
	} finally {
		if (timeout) clearTimeout(timeout)
	}
}

function fallbackName(
	address: Address.Address,
	isNative: boolean,
	isContract: boolean,
): string {
	const short = `${address.slice(0, 8)}…${address.slice(-6)}`
	return isNative
		? `Tempo system contract ${short}`
		: isContract
			? `Unverified contract ${short}`
			: `Wallet / account ${short}`
}

function describeGetterAction(name: string): string {
	const normalized = name.replaceAll('_', '').toLowerCase()
	if (normalized.includes('implementation')) return 'runs code from'
	if (
		normalized.includes('admin') ||
		normalized.includes('owner') ||
		normalized.includes('manager') ||
		normalized.includes('authority')
	)
		return 'is controlled by'
	if (normalized.includes('issuer')) return 'gets its issuer from'
	if (normalized.includes('feetoken') || normalized.includes('feecurrency'))
		return 'pays fees with'
	if (normalized.includes('registry')) return 'checks with'
	if (normalized.includes('policy')) return 'follows rules from'
	if (normalized.includes('factory')) return 'was created by'
	if (normalized.includes('validator')) return 'uses validator settings from'
	if (normalized.includes('recipient')) return 'sends to'
	if (normalized.includes('token')) return 'uses token from'
	return 'looks up an address from'
}

function dedupeEdges(edges: DiscoveryEdge[]): DiscoveryEdge[] {
	const seen = new Set<string>()
	return edges.filter((edge) => {
		const key = `${edge.from.toLowerCase()}:${edge.to.toLowerCase()}:${edge.label}`
		if (seen.has(key)) return false
		seen.add(key)
		return edge.from.toLowerCase() !== edge.to.toLowerCase()
	})
}
