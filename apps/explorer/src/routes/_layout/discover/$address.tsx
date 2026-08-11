import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as React from 'react'
import type {
	ContractDiscovery,
	DiscoveryEdge,
	DiscoveryNode,
} from '#lib/domain/contract-discovery'
import { CopyButton } from '#comps/CopyButton'
import { cx } from '#lib/css'
import { fetchContractDiscovery } from '#lib/domain/contract-discovery'
import { zAddress } from '#lib/zod'
import MinusIcon from '~icons/lucide/minus'
import PlusIcon from '~icons/lucide/plus'
import RefreshCwIcon from '~icons/lucide/refresh-cw'

const CARD_WIDTH = 248
const CARD_HEIGHT = 108
const COLUMN_GAP = 150
const ROW_GAP = 44
const PADDING = 56

const discoveryQueryOptions = (address: Address.Address) =>
	queryOptions({
		queryKey: ['contract-discovery', address],
		queryFn: () => fetchContractDiscovery(address),
		staleTime: 5 * 60_000,
	})

export const Route = createFileRoute('/_layout/discover/$address')({
	component: DiscoveryPage,
})

function DiscoveryPage(): React.JSX.Element {
	const params = Route.useParams()
	const address = zAddress().parse(params.address)
	const query = useQuery({
		...discoveryQueryOptions(address),
		enabled: typeof window !== 'undefined',
	})
	const navigate = useNavigate()
	const [input, setInput] = React.useState<string>(address)
	const [zoom, setZoom] = React.useState(1)
	const [selectedNodeId, setSelectedNodeId] = React.useState<string>(address)

	React.useEffect(() => {
		setSelectedNodeId(address)
	}, [address])

	const submit = (event: React.FormEvent) => {
		event.preventDefault()
		if (!Address.validate(input)) return
		void navigate({
			to: '/discover/$address',
			params: { address: Address.checksum(input) },
		})
	}

	return (
		<main className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 py-6 sm:px-6">
			<header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
				<div>
					<div className="mb-1 text-xs font-medium tracking-[0.18em] text-secondary uppercase">
						Tempo Discovery
					</div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Contract dependency graph
					</h1>
					<p className="mt-1 max-w-3xl text-sm text-secondary">
						Live relationships from verified getters, proxy slots, and native
						TIP-20 roles.
					</p>
				</div>
				<form className="flex w-full max-w-2xl gap-2" onSubmit={submit}>
					<input
						aria-label="Root contract address"
						className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
						value={input}
						onChange={(event) => setInput(event.target.value)}
					/>
					<button
						className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
						disabled={!Address.validate(input)}
						type="submit"
					>
						Discover
					</button>
				</form>
			</header>

			{query.isPending ? (
				<section className="relative min-h-[680px] overflow-hidden rounded-xl border border-border bg-surface">
					<GraphLoading />
				</section>
			) : query.isError ? (
				<section className="grid min-h-[680px] place-items-center rounded-xl border border-border bg-surface text-sm text-negative">
					{query.error.message}
				</section>
			) : (
				<DiscoveryWorkspace
					graph={query.data}
					selectedNodeId={selectedNodeId}
					setSelectedNodeId={setSelectedNodeId}
					zoom={zoom}
					setZoom={setZoom}
				/>
			)}
		</main>
	)
}

function DiscoveryWorkspace(props: {
	graph: ContractDiscovery
	selectedNodeId: string
	setSelectedNodeId: React.Dispatch<React.SetStateAction<string>>
	zoom: number
	setZoom: React.Dispatch<React.SetStateAction<number>>
}): React.JSX.Element {
	const selectedNode =
		props.graph.nodes.find(
			(node) => node.id.toLowerCase() === props.selectedNodeId.toLowerCase(),
		) ?? props.graph.nodes[0]

	if (!selectedNode) return <GraphLoading />

	return (
		<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
			<section className="relative min-h-[680px] overflow-hidden rounded-xl border border-border bg-surface">
				<div className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-surface/95 p-1 shadow-sm backdrop-blur">
					<IconButton
						label="Zoom out"
						onClick={() => props.setZoom((z) => Math.max(0.5, z - 0.1))}
					>
						<MinusIcon />
					</IconButton>
					<span className="w-12 text-center text-xs tabular-nums text-secondary">
						{Math.round(props.zoom * 100)}%
					</span>
					<IconButton
						label="Zoom in"
						onClick={() => props.setZoom((z) => Math.min(1.5, z + 0.1))}
					>
						<PlusIcon />
					</IconButton>
					<IconButton label="Reset zoom" onClick={() => props.setZoom(1)}>
						<RefreshCwIcon />
					</IconButton>
				</div>
				<DependencyGraph
					graph={props.graph}
					selectedNodeId={selectedNode.id}
					onSelect={(node) => props.setSelectedNodeId(node.id)}
					zoom={props.zoom}
				/>
			</section>
			<DiscoveryInspector
				graph={props.graph}
				node={selectedNode}
				onSelect={(node) => props.setSelectedNodeId(node.id)}
			/>
		</div>
	)
}

function DependencyGraph(props: {
	graph: ContractDiscovery
	selectedNodeId: string
	onSelect: (node: DiscoveryNode) => void
	zoom: number
}): React.JSX.Element {
	const markerId = React.useId()
	const layout = React.useMemo(
		() => buildLayout(props.graph.nodes),
		[props.graph.nodes],
	)
	const positionById = new Map(
		layout.nodes.map((item) => [item.node.id.toLowerCase(), item]),
	)

	return (
		<div className="h-[680px] overflow-auto">
			<div
				className="relative origin-top-left transition-transform duration-150"
				style={{
					width: layout.width,
					height: layout.height,
					transform: `scale(${props.zoom})`,
				}}
			>
				<svg
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
				>
					<defs>
						<marker
							id={markerId}
							markerHeight="8"
							markerWidth="8"
							orient="auto"
							refX="7"
							refY="4"
						>
							<path d="M0,0 L8,4 L0,8 Z" className="fill-border-strong" />
						</marker>
					</defs>
					{props.graph.edges.map((edge) => (
						<GraphEdgeLine
							edge={edge}
							from={positionById.get(edge.from.toLowerCase())}
							key={`${edge.from}:${edge.to}:${edge.label}`}
							markerId={markerId}
							selectedNodeId={props.selectedNodeId}
							to={positionById.get(edge.to.toLowerCase())}
						/>
					))}
				</svg>
				{layout.nodes.map(({ node, x, y }) => (
					<GraphNode
						key={node.id}
						node={node}
						onSelect={props.onSelect}
						selected={
							node.id.toLowerCase() === props.selectedNodeId.toLowerCase()
						}
						x={x}
						y={y}
					/>
				))}
				{props.graph.truncated && (
					<div className="absolute bottom-4 left-4 rounded-md border border-border bg-surface px-3 py-2 text-xs text-secondary shadow-sm">
						Partial graph: a source timed out or the 32-node limit was reached.
					</div>
				)}
			</div>
		</div>
	)
}

type PositionedNode = { node: DiscoveryNode; x: number; y: number }

type GraphNodeProps = PositionedNode & {
	onSelect: (node: DiscoveryNode) => void
	selected: boolean
}

function buildLayout(nodes: DiscoveryNode[]): {
	nodes: PositionedNode[]
	width: number
	height: number
} {
	const byDepth = new Map<number, DiscoveryNode[]>()
	for (const node of nodes) {
		const column = byDepth.get(node.depth) ?? []
		column.push(node)
		byDepth.set(node.depth, column)
	}
	const maxRows = Math.max(
		1,
		...[...byDepth.values()].map((items) => items.length),
	)
	const height = Math.max(680, PADDING * 2 + maxRows * (CARD_HEIGHT + ROW_GAP))
	const positioned = [...byDepth.entries()].flatMap(([depth, column]) => {
		const columnHeight =
			column.length * CARD_HEIGHT + (column.length - 1) * ROW_GAP
		const startY = Math.max(PADDING, (height - columnHeight) / 2)
		return column.map((node, index) => ({
			node,
			x: PADDING + depth * (CARD_WIDTH + COLUMN_GAP),
			y: startY + index * (CARD_HEIGHT + ROW_GAP),
		}))
	})
	const maxDepth = Math.max(0, ...nodes.map((node) => node.depth))
	return {
		nodes: positioned,
		width: PADDING * 2 + (maxDepth + 1) * CARD_WIDTH + maxDepth * COLUMN_GAP,
		height,
	}
}

function GraphNode(props: GraphNodeProps): React.JSX.Element {
	const { node, onSelect, selected, x, y } = props
	return (
		<button
			aria-label={`Inspect ${node.name}`}
			aria-pressed={selected}
			className={cx(
				'absolute rounded-xl border bg-surface p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md',
				selected || node.isRoot
					? 'border-accent ring-2 ring-accent/15'
					: 'border-border',
			)}
			onClick={() => onSelect(node)}
			style={{ left: x, top: y, width: CARD_WIDTH, height: CARD_HEIGHT }}
			type="button"
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="truncate text-sm font-semibold">{node.name}</div>
				<span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-secondary uppercase">
					{node.kind}
				</span>
			</div>
			<div
				className="truncate font-mono text-xs text-secondary"
				title={node.id}
			>
				{node.id}
			</div>
			<div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-tertiary">
				<span>
					{node.details.source
						? 'verified source'
						: node.details.bytecode.status}
				</span>
				<span>depth {node.depth}</span>
			</div>
		</button>
	)
}

function GraphEdgeLine(props: {
	edge: DiscoveryEdge
	from?: PositionedNode
	markerId: string
	selectedNodeId: string
	to?: PositionedNode
}): React.JSX.Element | null {
	if (!props.from || !props.to) return null
	const x1 = props.from.x + CARD_WIDTH
	const y1 = props.from.y + CARD_HEIGHT / 2
	const x2 = props.to.x
	const y2 = props.to.y + CARD_HEIGHT / 2
	const bend = Math.max(40, (x2 - x1) / 2)
	const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
	const labelX = (x1 + x2) / 2
	const labelY = (y1 + y2) / 2 - 7
	const isActive =
		props.edge.from.toLowerCase() === props.selectedNodeId.toLowerCase() ||
		props.edge.to.toLowerCase() === props.selectedNodeId.toLowerCase()
	const labelWidth = Math.max(58, props.edge.label.length * 7 + 18)
	return (
		<g>
			<path
				d={path}
				className={cx(
					'fill-none transition-colors',
					isActive ? 'stroke-accent' : 'stroke-border-strong',
				)}
				markerEnd={`url(#${props.markerId})`}
				strokeWidth={isActive ? '2' : '1.5'}
			/>
			<rect
				className="fill-surface stroke-border"
				height="20"
				rx="10"
				width={labelWidth}
				x={labelX - labelWidth / 2}
				y={labelY - 14}
			/>
			<text
				className={cx(
					'text-[11px]',
					isActive ? 'fill-accent' : 'fill-secondary',
				)}
				textAnchor="middle"
				x={labelX}
				y={labelY}
			>
				{props.edge.label}
			</text>
		</g>
	)
}

type DiscoveryInspectorProps = {
	graph: ContractDiscovery
	node: DiscoveryNode
	onSelect: (node: DiscoveryNode) => void
}

function DiscoveryInspector(props: DiscoveryInspectorProps): React.JSX.Element {
	const { graph, node, onSelect } = props
	const source = node.details.source
	const abi = node.details.abi
	const outgoing = graph.edges.filter(
		(edge) => edge.from.toLowerCase() === node.id.toLowerCase(),
	)
	const incoming = graph.edges.filter(
		(edge) => edge.to.toLowerCase() === node.id.toLowerCase(),
	)

	return (
		<aside className="flex max-h-[680px] min-h-[680px] flex-col overflow-y-auto rounded-xl border border-border bg-surface">
			<div className="border-b border-border px-5 py-4">
				<div className="mb-2 flex items-center justify-between gap-3">
					<span className="text-xs font-medium tracking-[0.16em] text-secondary uppercase">
						Node inspector
					</span>
					<span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-secondary uppercase">
						{node.kind}
					</span>
				</div>
				<h2 className="truncate text-lg font-semibold" title={node.name}>
					{node.name}
				</h2>
				<div className="mt-2 flex items-start gap-2">
					<code className="min-w-0 flex-1 break-all text-xs text-secondary">
						{node.id}
					</code>
					<CopyButton value={node.id} ariaLabel="Copy node address" />
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					<Link
						className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
						params={{ address: node.id }}
						search={{
							tab: node.kind === 'account' ? 'transactions' : 'contract',
						}}
						to="/address/$address"
					>
						Open address details
					</Link>
					<span className="rounded-md border border-border px-3 py-2 text-xs text-secondary">
						{node.isRoot ? 'Root node' : `Depth ${node.depth}`}
					</span>
				</div>
			</div>

			<InspectorSection title="Identity">
				<DetailRow label="Network">Tempo · chain {graph.chainId}</DetailRow>
				<DetailRow label="Classification">
					{node.kind === 'native'
						? 'Native TIP-20 precompile'
						: node.kind === 'contract'
							? 'Smart contract'
							: 'Externally owned account'}
				</DetailRow>
				<DetailRow label="Bytecode">
					{formatBytecode(node.details.bytecode)}
				</DetailRow>
			</InspectorSection>

			<InspectorSection title="Source & verification">
				{source ? (
					<SourceDetails source={source} />
				) : (
					<p className="px-4 py-3 text-xs text-secondary">
						{node.kind === 'account'
							? 'No deployed bytecode or verified source was found.'
							: 'No source metadata was returned for this node.'}
					</p>
				)}
			</InspectorSection>

			<InspectorSection title="Interface">
				{abi ? (
					<>
						<div className="grid grid-cols-2 gap-px border-b border-border bg-border">
							<Stat label="Functions" value={abi.functionCount} />
							<Stat label="Read" value={abi.readFunctionCount} />
							<Stat label="Write" value={abi.writeFunctionCount} />
							<Stat label="Events" value={abi.eventCount} />
							<Stat label="Errors" value={abi.errorCount} />
						</div>
						<details className="group px-4 py-3">
							<summary className="cursor-pointer list-none text-xs font-medium text-primary marker:hidden">
								Show functions
								<span className="ml-1 text-secondary">
									({abi.functionCount})
								</span>
							</summary>
							<div className="mt-3 divide-y divide-border rounded-md border border-border">
								{abi.functions.map((item) => (
									<div
										className="flex items-center justify-between gap-3 px-3 py-2"
										key={`${item.name}-${item.stateMutability}`}
									>
										<code className="min-w-0 truncate text-[11px] text-primary">
											{item.name}({item.inputs}) → {item.outputs}
										</code>
										<span className="shrink-0 text-[10px] text-secondary">
											{item.stateMutability}
										</span>
									</div>
								))}
							</div>
							{abi.truncated && (
								<p className="mt-2 text-[11px] text-secondary">
									Showing the first 100 functions. Open the address for the full
									ABI.
								</p>
							)}
						</details>
					</>
				) : (
					<p className="px-4 py-3 text-xs text-secondary">
						No ABI was available for this node.
					</p>
				)}
			</InspectorSection>

			{node.details.proxy && (
				<InspectorSection title="Proxy slots">
					{node.details.proxy.implementation && (
						<ProxyAddressRow
							address={node.details.proxy.implementation}
							label="Implementation"
							node={findNode(graph, node.details.proxy.implementation)}
							onSelect={onSelect}
						/>
					)}
					{node.details.proxy.admin && (
						<ProxyAddressRow
							address={node.details.proxy.admin}
							label="Admin"
							node={findNode(graph, node.details.proxy.admin)}
							onSelect={onSelect}
						/>
					)}
				</InspectorSection>
			)}

			<InspectorSection
				title={`Connections (${outgoing.length + incoming.length})`}
			>
				{outgoing.length > 0 && (
					<ConnectionGroup
						edges={outgoing}
						graph={graph}
						onSelect={onSelect}
						title="Points to"
					/>
				)}
				{incoming.length > 0 && (
					<ConnectionGroup
						edges={incoming}
						graph={graph}
						onSelect={onSelect}
						title="Referenced by"
					/>
				)}
				{outgoing.length === 0 && incoming.length === 0 && (
					<p className="px-4 py-3 text-xs text-secondary">
						No resolved relationships at this depth.
					</p>
				)}
			</InspectorSection>
		</aside>
	)
}

function InspectorSection(props: {
	title: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<section className="border-b border-border">
			<h3 className="px-4 pt-4 text-xs font-semibold tracking-wide text-secondary uppercase">
				{props.title}
			</h3>
			<div className="pb-3">{props.children}</div>
		</section>
	)
}

function DetailRow(props: {
	label: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="flex items-start justify-between gap-4 px-4 pt-3 text-xs">
			<span className="shrink-0 text-secondary">{props.label}</span>
			<span className="min-w-0 text-right text-primary">{props.children}</span>
		</div>
	)
}

function Stat(props: { label: string; value: number }): React.JSX.Element {
	return (
		<div className="bg-surface px-4 py-3">
			<div className="text-lg font-semibold tabular-nums">{props.value}</div>
			<div className="text-[10px] text-secondary uppercase">{props.label}</div>
		</div>
	)
}

function SourceDetails(props: {
	source: NonNullable<DiscoveryNode['details']['source']>
}): React.JSX.Element {
	const { source } = props
	return (
		<div>
			<DetailRow label="Status">
				<span className="text-positive">
					{source.kind === 'native' ? 'Native source' : 'Verified source'}
				</span>
			</DetailRow>
			<DetailRow label="Contract">{source.name}</DetailRow>
			<DetailRow label="Language">{source.language}</DetailRow>
			<DetailRow label="Source files">{source.sourceFileCount}</DetailRow>
			{source.compilerVersion && (
				<DetailRow label="Compiler">
					{source.compiler} {source.compilerVersion}
				</DetailRow>
			)}
			{source.fullyQualifiedName && (
				<DetailRow label="FQN">
					<code className="break-all text-[11px]">
						{source.fullyQualifiedName}
					</code>
				</DetailRow>
			)}
			{source.repository && (
				<DetailRow label="Repository">
					<a
						className="text-accent hover:underline"
						href={source.commitUrl ?? source.repository}
						rel="noreferrer"
						target="_blank"
					>
						{source.repository}
					</a>
				</DetailRow>
			)}
			{source.docsUrl && (
				<DetailRow label="Docs">
					<a
						className="text-accent hover:underline"
						href={source.docsUrl}
						rel="noreferrer"
						target="_blank"
					>
						Open documentation
					</a>
				</DetailRow>
			)}
		</div>
	)
}

function ProxyAddressRow(props: {
	address: DiscoveryNode['id']
	label: string
	node?: DiscoveryNode
	onSelect: (node: DiscoveryNode) => void
}): React.JSX.Element {
	return (
		<div className="flex items-center justify-between gap-3 px-4 pt-3 text-xs">
			<span className="text-secondary">{props.label}</span>
			<div className="flex min-w-0 items-center gap-2">
				{props.node ? (
					<button
						className="truncate text-accent hover:underline"
						onClick={() => props.node && props.onSelect(props.node)}
						type="button"
					>
						{props.node.name}
					</button>
				) : (
					<span className="truncate text-primary">
						{shortenAddress(props.address)}
					</span>
				)}
				<Link
					className="shrink-0 font-mono text-[10px] text-secondary hover:text-primary"
					params={{ address: props.address }}
					to="/address/$address"
				>
					{shortenAddress(props.address)}
				</Link>
			</div>
		</div>
	)
}

function ConnectionGroup(props: {
	edges: DiscoveryEdge[]
	graph: ContractDiscovery
	onSelect: (node: DiscoveryNode) => void
	title: string
}): React.JSX.Element {
	return (
		<div className="px-4 pt-3">
			<div className="mb-2 text-[11px] font-medium text-secondary">
				{props.title}
			</div>
			<div className="space-y-2">
				{props.edges.map((edge) => {
					const address = props.title === 'Points to' ? edge.to : edge.from
					const node = findNode(props.graph, address)
					return (
						<div
							className="rounded-md border border-border px-3 py-2"
							key={`${edge.from}:${edge.to}:${edge.label}`}
						>
							<div className="mb-1 flex items-center justify-between gap-2">
								<span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-secondary">
									{edge.kind}
								</span>
								<code className="text-[10px] text-tertiary">{edge.label}</code>
							</div>
							<div className="flex items-center justify-between gap-2">
								{node ? (
									<button
										className="min-w-0 truncate text-left text-xs font-medium text-accent hover:underline"
										onClick={() => props.onSelect(node)}
										type="button"
									>
										{node.name}
									</button>
								) : (
									<span className="truncate text-xs text-primary">
										{shortenAddress(address)}
									</span>
								)}
								<Link
									className="shrink-0 font-mono text-[10px] text-secondary hover:text-primary"
									params={{ address }}
									to="/address/$address"
								>
									{shortenAddress(address)}
								</Link>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

function findNode(
	graph: ContractDiscovery,
	address: DiscoveryNode['id'],
): DiscoveryNode | undefined {
	return graph.nodes.find(
		(node) => node.id.toLowerCase() === address.toLowerCase(),
	)
}

function shortenAddress(address: string): string {
	return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function formatBytecode(
	bytecode: DiscoveryNode['details']['bytecode'],
): string {
	if (bytecode.status === 'precompile') return 'Native precompile'
	if (bytecode.status === 'unavailable') return 'RPC unavailable'
	if (bytecode.status === 'empty') return 'No deployed bytecode'
	return `${formatBytes(bytecode.bytes)} deployed`
}

function formatBytes(value: number | undefined): string {
	if (value === undefined) return 'Unknown size'
	if (value < 1_024) return `${value} B`
	return `${(value / 1_024).toFixed(value < 10_240 ? 1 : 0)} KB`
}

function IconButton(props: {
	label: string
	onClick: () => void
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<button
			aria-label={props.label}
			className="grid size-8 place-items-center rounded-md text-secondary hover:bg-surface-secondary hover:text-primary [&>svg]:size-4"
			onClick={props.onClick}
			type="button"
		>
			{props.children}
		</button>
	)
}

function GraphLoading(): React.JSX.Element {
	return (
		<div className="grid min-h-[680px] place-items-center">
			<div className="flex items-center gap-3 text-sm text-secondary">
				<div className="size-4 animate-spin rounded-full border-2 border-border border-t-accent" />
				Reading live contract relationships…
			</div>
		</div>
	)
}
