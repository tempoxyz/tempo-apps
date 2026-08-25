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
import ArrowRightIcon from '~icons/lucide/arrow-right'
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
		<main className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 px-4 pt-20 pb-16 sm:px-6">
			<header className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
				<div>
					<div className="mb-2 text-[11px] font-medium tracking-[0.16em] text-tertiary uppercase">
						Tempo Discovery
					</div>
					<h1 className="text-[32px] leading-none font-semibold tracking-[-0.02em] text-primary">
						Contract dependency graph
					</h1>
					<p className="mt-2 max-w-[720px] text-[14px] text-secondary">
						See what this contract depends on, who controls it, and which system
						contracts it uses.
					</p>
				</div>
				<form className="w-full max-w-[640px]" onSubmit={submit}>
					<div className="relative">
						<input
							aria-label="Root contract address"
							className="h-[42px] w-full rounded-[10px] border border-base-border bg-surface px-[16px] pr-[52px] font-mono text-[13px] text-primary outline-none placeholder:text-tertiary focus-visible:border-focus"
							value={input}
							onChange={(event) => setInput(event.target.value)}
						/>
						<button
							aria-label="Discover contract"
							className="absolute top-1/2 right-[6px] grid size-[30px] -translate-y-1/2 place-items-center rounded-[10px]! border border-base-border bg-base-background/90 text-primary press-down transition-colors hover:bg-surface disabled:cursor-default disabled:text-tertiary"
							disabled={!Address.validate(input)}
							type="submit"
						>
							<ArrowRightIcon className="size-[14px]" />
						</button>
					</div>
				</form>
			</header>

			{query.isPending ? (
				<section className="relative min-h-[680px] overflow-hidden rounded-[10px] border border-card-border bg-card-header">
					<GraphLoading />
				</section>
			) : query.isError ? (
				<section className="grid min-h-[680px] place-items-center rounded-[10px] border border-card-border bg-card-header text-[13px] text-negative">
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
		<div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
			<section className="relative min-h-[680px] min-w-0 overflow-hidden rounded-[10px] border border-card-border bg-card-header">
				<div className="absolute top-3 right-3 z-20 flex items-center gap-[2px] rounded-[7px] border border-card-border bg-card-header/95 p-[2px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] backdrop-blur">
					<IconButton
						label="Zoom out"
						onClick={() => props.setZoom((z) => Math.max(0.5, z - 0.1))}
					>
						<MinusIcon />
					</IconButton>
					<span className="w-12 text-center text-[11px] tabular-nums text-tertiary">
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
		<div className="h-[680px] overflow-auto bg-card">
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
							<path d="M0,0 L8,4 L0,8 Z" className="fill-card-border" />
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
					<div className="absolute bottom-4 left-4 rounded-[6px] border border-card-border bg-card-header px-3 py-2 text-[11px] text-secondary shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
						Partial graph: a source timed out or the 32-node limit was reached.
					</div>
				)}
				<div className="absolute right-4 bottom-4 rounded-[6px] border border-card-border bg-card-header px-3 py-2 text-[11px] text-tertiary shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
					Arrows read left to right: the item on the left relies on, reads, or
					is controlled by the item on the right.
				</div>
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
				'absolute rounded-[10px] border bg-card-header p-[14px] text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-accent hover:bg-surface',
				selected || node.isRoot
					? 'border-accent bg-accent/[0.04] ring-1 ring-accent/30'
					: 'border-card-border',
			)}
			onClick={() => onSelect(node)}
			style={{ left: x, top: y, width: CARD_WIDTH, height: CARD_HEIGHT }}
			type="button"
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="truncate text-[13px] font-medium text-primary">
					{node.name}
				</div>
				<span className="shrink-0 rounded-[5px] border border-card-border bg-base-alt px-[6px] py-[2px] text-[10px] font-medium leading-none text-tertiary">
					{nodeKindLabel(node.kind)}
				</span>
			</div>
			<div
				className="truncate font-mono text-[11px] text-secondary"
				title={node.id}
			>
				{node.id}
			</div>
			<div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-tertiary">
				<span>
					{node.details.source ? 'Verified source' : nodeStatusLabel(node)}
				</span>
				<span>Level {node.depth + 1}</span>
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
	const label = props.edge.action
	const labelWidth = Math.min(176, Math.max(82, label.length * 6.4 + 22))
	return (
		<g>
			<title>
				{props.from.node.name} {props.edge.action} {props.to.node.name}
			</title>
			<path
				d={path}
				className={cx(
					'fill-none transition-colors',
					isActive ? 'stroke-accent' : 'stroke-card-border',
				)}
				markerEnd={`url(#${props.markerId})`}
				strokeWidth={isActive ? '2' : '1.5'}
			/>
			<rect
				className="fill-card-header stroke-card-border"
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
				{label}
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
		<aside className="flex min-h-0 max-h-none flex-col overflow-y-auto rounded-[10px] border border-card-border bg-card-header lg:max-h-[680px] lg:min-h-[680px]">
			<div className="border-b border-dashed border-card-border px-[16px] py-[14px]">
				<div className="mb-2 flex items-center justify-between gap-3">
					<span className="text-[11px] font-medium tracking-[0.14em] text-tertiary uppercase">
						Node inspector
					</span>
					<span className="rounded-[5px] border border-card-border bg-base-alt px-[6px] py-[2px] text-[10px] font-medium leading-none text-tertiary">
						{nodeKindLabel(node.kind)}
					</span>
				</div>
				<h2
					className="truncate text-[18px] font-medium text-primary"
					title={node.name}
				>
					{node.name}
				</h2>
				<div className="mt-2 flex items-start gap-2">
					<code className="min-w-0 flex-1 break-all font-mono text-[12px] text-secondary">
						{node.id}
					</code>
					<CopyButton value={node.id} ariaLabel="Copy node address" />
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<Link
						className="rounded-[6px] bg-primary px-[10px] py-[7px] text-[12px] font-medium text-content-inverse press-down hover:opacity-90"
						params={{ address: node.id }}
						search={{
							tab: node.kind === 'account' ? 'transactions' : 'contract',
						}}
						to="/address/$address"
					>
						Open address details
					</Link>
					<span className="rounded-[6px] border border-card-border bg-base-alt px-[10px] py-[7px] text-[12px] text-secondary">
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
					<p className="px-[16px] py-[10px] text-[12px] text-tertiary">
						{node.kind === 'account'
							? 'No deployed bytecode or verified source was found.'
							: 'No source metadata was returned for this node.'}
					</p>
				)}
			</InspectorSection>

			<InspectorSection title="Interface">
				{abi ? (
					<>
						<div className="grid grid-cols-2 gap-px border-b border-card-border bg-card-border">
							<Stat label="Functions" value={abi.functionCount} />
							<Stat label="Read" value={abi.readFunctionCount} />
							<Stat label="Write" value={abi.writeFunctionCount} />
							<Stat label="Events" value={abi.eventCount} />
							<Stat label="Errors" value={abi.errorCount} />
						</div>
						<details className="group px-[16px] py-[10px]">
							<summary className="cursor-pointer list-none text-[12px] font-medium text-primary marker:hidden">
								Show functions
								<span className="ml-1 text-secondary">
									({abi.functionCount})
								</span>
							</summary>
							<div className="mt-3 divide-y divide-card-border overflow-hidden rounded-[6px] border border-card-border bg-card">
								{abi.functions.map((item) => (
									<div
										className="flex items-center justify-between gap-3 border-b border-card-border px-[10px] py-[8px] last:border-b-0"
										key={`${item.name}-${item.stateMutability}`}
									>
										<code className="min-w-0 truncate font-mono text-[11px] text-primary">
											{item.name}({item.inputs}) → {item.outputs}
										</code>
										<span className="shrink-0 rounded-[4px] bg-base-alt px-[5px] py-[2px] text-[10px] text-tertiary">
											{item.stateMutability}
										</span>
									</div>
								))}
							</div>
							{abi.truncated && (
								<p className="mt-2 text-[11px] text-tertiary">
									Showing the first 100 functions. Open the address for the full
									ABI.
								</p>
							)}
						</details>
					</>
				) : (
					<p className="px-[16px] py-[10px] text-[12px] text-tertiary">
						No ABI was available for this node.
					</p>
				)}
			</InspectorSection>

			{node.details.proxy && (
				<InspectorSection title="How this contract is set up">
					{node.details.proxy.implementation && (
						<ProxyAddressRow
							address={node.details.proxy.implementation}
							label="Runs code from"
							node={findNode(graph, node.details.proxy.implementation)}
							onSelect={onSelect}
						/>
					)}
					{node.details.proxy.admin && (
						<ProxyAddressRow
							address={node.details.proxy.admin}
							label="Controlled by"
							node={findNode(graph, node.details.proxy.admin)}
							onSelect={onSelect}
						/>
					)}
				</InspectorSection>
			)}

			<InspectorSection
				title={`How it connects (${outgoing.length + incoming.length})`}
			>
				{outgoing.length > 0 && (
					<ConnectionGroup
						edges={outgoing}
						graph={graph}
						onSelect={onSelect}
						title="Needs from"
					/>
				)}
				{incoming.length > 0 && (
					<ConnectionGroup
						edges={incoming}
						graph={graph}
						onSelect={onSelect}
						title="Used by"
					/>
				)}
				{outgoing.length === 0 && incoming.length === 0 && (
					<p className="px-[16px] py-[10px] text-[12px] text-tertiary">
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
		<section className="border-b border-dashed border-card-border">
			<h3 className="px-[16px] pt-[12px] text-[11px] font-medium tracking-[0.08em] text-tertiary uppercase">
				{props.title}
			</h3>
			<div className="pb-[6px]">{props.children}</div>
		</section>
	)
}

function DetailRow(props: {
	label: string
	children: React.ReactNode
}): React.JSX.Element {
	return (
		<div className="flex items-start justify-between gap-4 px-[16px] py-[7px] text-[12px]">
			<span className="min-w-[84px] shrink-0 text-tertiary">{props.label}</span>
			<span className="min-w-0 text-right text-primary">{props.children}</span>
		</div>
	)
}

function Stat(props: { label: string; value: number }): React.JSX.Element {
	return (
		<div className="bg-card px-[16px] py-[10px]">
			<div className="text-[18px] font-medium tabular-nums text-primary">
				{props.value}
			</div>
			<div className="text-[10px] text-tertiary uppercase">{props.label}</div>
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
		<div className="flex items-center justify-between gap-3 px-[16px] py-[7px] text-[12px]">
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
		<div className="px-[16px] pt-[10px]">
			<div className="mb-2 text-[11px] font-medium text-tertiary">
				{props.title}
			</div>
			<div className="flex flex-col gap-2">
				{props.edges.map((edge) => {
					const address = props.title === 'Needs from' ? edge.to : edge.from
					const node = findNode(props.graph, address)
					return (
						<div
							className="rounded-[6px] border border-card-border bg-card px-[10px] py-[9px]"
							key={`${edge.from}:${edge.to}:${edge.label}`}
						>
							<div className="mb-1 flex items-center justify-between gap-2">
								<span className="text-[12px] font-medium text-primary">
									{edge.action}
								</span>
								<span className="rounded-[4px] bg-base-alt px-[5px] py-[2px] text-[10px] text-tertiary">
									{connectionKindLabel(edge.kind)}
								</span>
							</div>
							<div className="flex items-center justify-between gap-2">
								{node ? (
									<button
										className="min-w-0 truncate text-left text-[12px] font-medium text-accent press-down hover:underline"
										onClick={() => props.onSelect(node)}
										type="button"
									>
										{node.name}
									</button>
								) : (
									<span className="truncate text-[12px] text-primary">
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
							<div
								className="mt-1 truncate font-mono text-[10px] text-tertiary"
								title={edge.label}
							>
								Technical source: {edge.label}
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

function nodeKindLabel(kind: DiscoveryNode['kind']): string {
	if (kind === 'native') return 'System contract'
	if (kind === 'account') return 'Wallet / account'
	return 'Contract'
}

function nodeStatusLabel(node: DiscoveryNode): string {
	if (node.details.bytecode.status === 'precompile') return 'Tempo system code'
	if (node.details.bytecode.status === 'available') return 'On-chain code'
	if (node.details.bytecode.status === 'empty') return 'No code found'
	return 'Code unavailable'
}

function connectionKindLabel(kind: DiscoveryEdge['kind']): string {
	if (kind === 'role') return 'Permission'
	if (kind === 'proxy') return 'Contract setup'
	return 'Contract lookup'
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
			className="grid size-[24px] place-items-center rounded-[6px] text-tertiary press-down hover:bg-base-alt hover:text-primary [&>svg]:size-[14px]"
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
			<div className="flex items-center gap-3 text-[13px] text-tertiary">
				<div className="size-4 animate-spin rounded-full border-2 border-card-border border-t-accent" />
				Reading live contract relationships…
			</div>
		</div>
	)
}
