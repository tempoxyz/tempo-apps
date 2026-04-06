import type { Address, Hex } from 'viem'

export type DemoState =
	| 'idle'
	| 'registering'
	| 'deriving'
	| 'sending'
	| 'resolving'
	| 'complete'

export type DemoStep =
	| 'idle'
	| 'register-start'
	| 'register-mining'
	| 'register-tx'
	| 'register-confirmed'
	| 'derive-virtual'
	| 'derive-anatomy'
	| 'send-start'
	| 'send-tx'
	| 'resolve-detect'
	| 'resolve-lookup'
	| 'resolve-forward'
	| 'transfer-events'
	| 'balances-final'
	| 'complete'

export type TransferEvent = {
	from: string
	to: string
	amount: string
	label: string
	txHash?: string
}

export type MiningProgress = {
	totalAttempts: number
	hashesPerSecond: number
	workerCount: number
}

export type WalkthroughData = {
	exchangeAddress: Address | null
	senderAddress: Address | null
	salt: Hex | null
	masterId: Hex | null
	miningProgress: MiningProgress | null
	virtualAddress: Address | null
	userTag: Hex | null
	registerTxHash: string | null
	transferTxHash: string | null
	exchangeBalance: string
	senderBalance: string
	virtualBalance: string
	transferEvents: TransferEvent[]
}
