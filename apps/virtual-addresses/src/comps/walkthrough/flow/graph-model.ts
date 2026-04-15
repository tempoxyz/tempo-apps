import type { Node, Edge } from '@xyflow/react'
import type {
	FlowStep,
	NodeStatus,
	StepDef,
	WalkthroughData,
} from '#lib/walkthrough-types'

// ── Step definitions ─────────────────────────────────────────────────────────

export const STEPS: StepDef[] = [
	{
		id: 0,
		label: 'Ready',
		description:
			'Click the play button to walk through TIP-1022 virtual address resolution with real on-chain transactions.',
	},
	{
		id: 1,
		label: 'Register master',
		description:
			'The exchange registers as a virtual-address master in the Virtual Registry with a pre-mined salt and receives a 4-byte masterId.',
	},
	{
		id: 2,
		label: 'Derive virtual address',
		description:
			'The exchange derives a virtual address offline by concatenating masterId + magic bytes (0xFDFD…FD) + userTag. No on-chain transaction needed.',
	},
	{
		id: 3,
		label: 'Send to virtual address',
		description:
			'The sender transfers 100 PathUSD to the derived virtual address — a standard TIP-20 transfer.',
	},
	{
		id: 4,
		label: 'Protocol resolves',
		description:
			'The TIP-20 precompile detects magic bytes, extracts the masterId, looks up the registered master address, and forwards tokens automatically.',
	},
	{
		id: 5,
		label: 'Master receives funds',
		description:
			'The exchange receives the funds directly. The virtual address balance remains zero — no sweep transaction needed.',
	},
	{
		id: 6,
		label: 'Complete',
		description:
			'A sender paid a derived virtual address while the protocol routed funds to the master. Two Transfer events preserve the full audit trail.',
	},
]

// ── Node positions (React Flow coordinates) ──────────────────────────────────

export const NODE_POSITIONS = {
	exchange: { x: 0, y: 200 },
	registry: { x: 370, y: 0 },
	virtual: { x: 370, y: 400 },
	sender: { x: 740, y: 400 },
	protocol: { x: 740, y: 200 },
} as const

// ── Node tooltips ────────────────────────────────────────────────────────────

const NODE_TOOLTIPS: Record<string, string> = {
	exchange:
		'Registers as a virtual-address master and receives forwarded funds',
	registry: 'On-chain registry mapping masterId → master address',
	virtual: 'Derived offline from masterId + magic + userTag',
	sender: 'Sends TIP-20 tokens to the virtual address',
	protocol: 'TIP-20 precompile that detects and resolves virtual addresses',
}

// ── Step participants (for dimming) ──────────────────────────────────────────

export const STEP_PARTICIPANTS: Record<number, string[] | null> = {
	0: null,
	1: ['exchange', 'registry'],
	2: ['exchange', 'virtual'],
	3: ['sender', 'virtual'],
	4: ['virtual', 'protocol', 'registry'],
	5: ['protocol', 'exchange'],
	6: null,
}

// ── Step focus (for fitView) ─────────────────────────────────────────────────

export const STEP_FOCUS: Record<
	number,
	{ nodes: string[]; padding: number } | null
> = {
	0: { nodes: ['exchange'], padding: 1.2 },
	1: { nodes: ['exchange', 'registry'], padding: 0.4 },
	2: { nodes: ['exchange', 'virtual'], padding: 0.4 },
	3: { nodes: ['sender', 'virtual'], padding: 0.4 },
	4: { nodes: ['virtual', 'protocol', 'registry'], padding: 0.3 },
	5: { nodes: ['protocol', 'exchange'], padding: 0.4 },
	6: null,
}

// ── Node data types ──────────────────────────────────────────────────────────

export type FlowNodeData = {
	label: string
	subtitle?: string
	tooltip?: string
	status: NodeStatus
	props?: { key: string; value: string }[]
	[k: string]: unknown
}

export type FlowEdgeData = {
	amount: string
	subtitle?: string
	status: NodeStatus
	dashed?: boolean
	[key: string]: unknown
}

// ── Build nodes ──────────────────────────────────────────────────────────────

function statusFor(step: FlowStep, activeAt: number[]): NodeStatus {
	if (step === 6) return 'active'
	if (activeAt.includes(step)) return 'active'
	if (activeAt.some((i) => step > i)) return 'done'
	return 'idle'
}

export function buildNodes(
	step: FlowStep,
	data: WalkthroughData,
): Node<FlowNodeData>[] {
	return [
		{
			id: 'exchange',
			type: 'flow-card',
			position: NODE_POSITIONS.exchange,
			data: {
				label: 'Exchange / Master',
				subtitle: 'Virtual-address master',
				tooltip: NODE_TOOLTIPS.exchange,
				status: step === 0 ? 'active' : statusFor(step, [1, 2, 5]),
				props: [
					...(data.masterId ? [{ key: 'masterId', value: data.masterId }] : []),
					...(data.exchangeBalance !== '0'
						? [{ key: 'PathUSD', value: data.exchangeBalance }]
						: []),
				],
			},
		},
		{
			id: 'registry',
			type: 'flow-card',
			position: NODE_POSITIONS.registry,
			data: {
				label: 'Virtual Registry',
				subtitle: 'Precompile',
				tooltip: NODE_TOOLTIPS.registry,
				status: statusFor(step, [1, 4]),
				props: data.masterId
					? [{ key: 'mapping', value: `${data.masterId} → master` }]
					: [],
			},
		},
		{
			id: 'virtual',
			type: 'flow-card',
			position: NODE_POSITIONS.virtual,
			data: {
				label: 'Virtual Address',
				subtitle: data.virtualAddress
					? `${data.virtualAddress.slice(0, 10)}…${data.virtualAddress.slice(-6)}`
					: 'Not yet derived',
				tooltip: NODE_TOOLTIPS.virtual,
				status: statusFor(step, [2, 3, 4]),
				props: [
					...(data.virtualBalance !== '0'
						? [{ key: 'PathUSD', value: data.virtualBalance }]
						: []),
				],
			},
		},
		{
			id: 'sender',
			type: 'flow-card',
			position: NODE_POSITIONS.sender,
			data: {
				label: 'Sender',
				subtitle: data.senderAddress
					? `${data.senderAddress.slice(0, 8)}…${data.senderAddress.slice(-4)}`
					: undefined,
				tooltip: NODE_TOOLTIPS.sender,
				status: statusFor(step, [3]),
				props: [
					...(data.senderBalance !== '0'
						? [{ key: 'PathUSD', value: data.senderBalance }]
						: []),
				],
			},
		},
		{
			id: 'protocol',
			type: 'flow-card',
			position: NODE_POSITIONS.protocol,
			data: {
				label: 'TIP-1022 Resolver',
				subtitle: 'TIP-20 Precompile',
				tooltip: NODE_TOOLTIPS.protocol,
				status: statusFor(step, [4, 5]),
				props: [],
			},
		},
	]
}

// ── Build edges ──────────────────────────────────────────────────────────────

function edgeStatus(step: FlowStep, activeAt: number): NodeStatus {
	if (step === 6) return 'active'
	if (step === activeAt) return 'active'
	if (step > activeAt) return 'done'
	return 'idle'
}

export function buildEdges(
	step: FlowStep,
	data: WalkthroughData,
	phase: string | null,
): Edge<FlowEdgeData>[] {
	const txSub = (hash: string | null, fallback?: string) => {
		if (hash) return `${hash.slice(0, 8)}…${hash.slice(-4)}`
		return fallback
	}

	return [
		{
			id: 'e-exchange-registry',
			source: 'exchange',
			target: 'registry',
			sourceHandle: 'top',
			targetHandle: 'left',
			type: 'animated',
			data: {
				amount: 'register master',
				subtitle: txSub(
					data.registerTxHash,
					step === 1 ? (phase ?? 'Registering…') : undefined,
				),
				status: edgeStatus(step, 1),
			},
		},
		{
			id: 'e-exchange-virtual',
			source: 'exchange',
			target: 'virtual',
			sourceHandle: 'bottom',
			targetHandle: 'left',
			type: 'animated',
			data: {
				amount: 'derive address',
				subtitle: data.virtualAddress
					? `${data.virtualAddress.slice(0, 10)}…`
					: undefined,
				status: edgeStatus(step, 2),
				dashed: true,
			},
		},
		{
			id: 'e-sender-virtual',
			source: 'sender',
			target: 'virtual',
			sourceHandle: 'left',
			targetHandle: 'right',
			type: 'animated',
			data: {
				amount: 'send 100 PathUSD',
				subtitle: txSub(
					data.transferTxHash,
					step === 3 ? (phase ?? 'Sending…') : undefined,
				),
				status: edgeStatus(step, 3),
			},
		},
		{
			id: 'e-virtual-protocol',
			source: 'virtual',
			target: 'protocol',
			sourceHandle: 'top-right',
			targetHandle: 'bottom',
			type: 'animated',
			data: {
				amount: 'magic detected',
				status: edgeStatus(step, 4),
			},
		},
		{
			id: 'e-protocol-registry',
			source: 'protocol',
			target: 'registry',
			sourceHandle: 'top',
			targetHandle: 'right',
			type: 'animated',
			data: {
				amount: 'lookup masterId',
				status: edgeStatus(step, 4),
				dashed: true,
			},
		},
		{
			id: 'e-protocol-exchange',
			source: 'protocol',
			target: 'exchange',
			sourceHandle: 'left',
			targetHandle: 'right',
			type: 'animated',
			data: {
				amount: 'forward to master',
				status: edgeStatus(step, 5),
			},
		},
	]
}
