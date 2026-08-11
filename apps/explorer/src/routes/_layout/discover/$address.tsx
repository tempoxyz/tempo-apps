import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import * as React from 'react'
import type {
	ContractDiscovery,
	DiscoveryEdge,
	DiscoveryNode,
} from '#lib/domain/contract-discovery'
import { fetchContractDiscovery } from '#lib/domain/contract-discovery'
import { zAddress } from '#lib/zod'
import MinusIcon from '~icons/lucide/minus'
import PlusIcon from '~icons/lucide/plus'
import RefreshCwIcon from '~icons/lucide/refresh-cw'

const CARD_WIDTH = 248
const CARD_HEIGHT = 92
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

			<section className="relative min-h-[680px] overflow-hidden rounded-xl border border-border bg-surface">
				<div className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-surface/95 p-1 shadow-sm backdrop-blur">
					<IconButton
						label="Zoom out"
						onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
					>
						<MinusIcon />
					</IconButton>
					<span className="w-12 text-center text-xs tabular-nums text-secondary">
						{Math.round(zoom * 100)}%
					</span>
					<IconButton
						label="Zoom in"
						onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
					>
						<PlusIcon />
					</IconButton>
					<IconButton label="Reset zoom" onClick={() => setZoom(1)}>
						<RefreshCwIcon />
					</IconButton>
				</div>

				{query.isPending ? (
					<GraphLoading />
				) : query.isError ? (
					<div className="grid min-h-[680px] place-items-center text-sm text-negative">
						{query.error.message}
					</div>
				) : (
					<DependencyGraph graph={query.data} zoom={zoom} />
				)}
			</section>
		</main>
	)
}

function DependencyGraph(props: {
	graph: ContractDiscovery
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
							to={positionById.get(edge.to.toLowerCase())}
						/>
					))}
				</svg>
				{layout.nodes.map(({ node, x, y }) => (
					<GraphNode key={node.id} node={node} x={x} y={y} />
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

function GraphNode(props: PositionedNode): React.JSX.Element {
	const { node, x, y } = props
	return (
		<Link
			className={`absolute rounded-xl border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md ${node.isRoot ? 'border-accent ring-2 ring-accent/15' : 'border-border'}`}
			params={{ address: node.id }}
			style={{ left: x, top: y, width: CARD_WIDTH, height: CARD_HEIGHT }}
			to="/address/$address"
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
		</Link>
	)
}

function GraphEdgeLine(props: {
	edge: DiscoveryEdge
	from?: PositionedNode
	markerId: string
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
	return (
		<g>
			<path
				d={path}
				className="fill-none stroke-border-strong"
				markerEnd={`url(#${props.markerId})`}
				strokeWidth="1.5"
			/>
			<text
				className="fill-secondary text-[11px]"
				textAnchor="middle"
				x={labelX}
				y={labelY}
			>
				{props.edge.label}
			</text>
		</g>
	)
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
