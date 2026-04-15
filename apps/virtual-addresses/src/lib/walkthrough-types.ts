import type { Address, Hex } from 'viem'

export type FlowStep = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type NodeStatus = 'idle' | 'active' | 'done'

export type TransferEvent = {
	from: string
	to: string
	amount: string
	label: string
	txHash?: string
}

export type WalkthroughData = {
	exchangeAddress: Address | null
	senderAddress: Address | null
	salt: Hex | null
	masterId: Hex | null
	virtualAddress: Address | null
	userTag: Hex | null
	registerTxHash: string | null
	transferTxHash: string | null
	exchangeBalance: string
	senderBalance: string
	virtualBalance: string
	transferEvents: TransferEvent[]
}

export type StepDef = {
	id: FlowStep
	label: string
	description: string
}
