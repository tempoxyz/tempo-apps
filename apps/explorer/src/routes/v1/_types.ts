import type { Address, Hex } from 'ox'

/**
 * Standard API response wrapper for successful responses
 */
export type ApiResponse<T> = {
	data: T
	meta?: {
		chainId: number
		timestamp: number
	}
}

/**
 * Standard API error response
 */
export type ApiError = {
	error: {
		code: string
		message: string
		details?: unknown
	}
}

/**
 * Pagination metadata
 */
export type PaginationMeta = {
	total: number
	offset: number
	limit: number
	hasMore: boolean
}

/**
 * Paginated API response
 */
export type PaginatedResponse<T> = ApiResponse<T> & {
	pagination: PaginationMeta
}

// ============================================================================
// Address Types
// ============================================================================

export type AddressInfo = {
	address: Address.Address
	transactionCount: number
	totalValue: number
	firstActivityBlock: string | null
	lastActivityBlock: string | null
}

export type AddressTransaction = {
	hash: Hex.Hex
	blockNumber: string
	from: Address.Address
	to: Address.Address | null
	value: string
	gasUsed: string
	gasPrice: string
	timestamp?: number
}

export type TokenBalance = {
	token: Address.Address
	symbol: string | null
	name: string | null
	decimals: number
	balance: string
}

// ============================================================================
// Transaction Types
// ============================================================================

export type TransactionInfo = {
	hash: Hex.Hex
	blockNumber: string
	blockHash: Hex.Hex | null
	from: Address.Address
	to: Address.Address | null
	value: string
	input: Hex.Hex
	nonce: string
	gas: string
	gasPrice: string
	gasUsed?: string
	status?: 'success' | 'reverted'
	timestamp?: number
}

export type BalanceChange = {
	address: Address.Address
	token: Address.Address
	symbol: string
	decimals: number
	balanceBefore: string
	balanceAfter: string
	diff: string
}

// ============================================================================
// Token Types
// ============================================================================

export type TokenInfo = {
	address: Address.Address
	symbol: string
	name: string
	currency: string
	createdAt: number
}

export type TokenTransfer = {
	from: Address.Address
	to: Address.Address
	value: string
	transactionHash: Hex.Hex
	blockNumber: string
	logIndex: number
	timestamp: string | null
}

export type TokenHolder = {
	address: Address.Address
	balance: string
}

// ============================================================================
// Block Types
// ============================================================================

export type BlockInfo = {
	number: string
	hash: Hex.Hex
	parentHash: Hex.Hex
	timestamp: number
	gasUsed: string
	gasLimit: string
	baseFeePerGas: string | null
	transactionCount: number
}

// ============================================================================
// Search Types
// ============================================================================

export type SearchResult =
	| {
			type: 'address'
			address: Address.Address
			isTip20: boolean
	  }
	| {
			type: 'transaction'
			hash: Hex.Hex
			timestamp?: number
	  }
	| {
			type: 'token'
			address: Address.Address
			symbol: string
			name: string
	  }

// ============================================================================
// Stats Types
// ============================================================================

export type ChainStats = {
	latestBlock: string
	tokenCount: number
}
