import { QueryClient } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { txQueryOptions } from '#lib/queries/tx'

const token = '0x20c0000000000000000000000000000000000000'
const { transaction, metadataFromLogs, metadataForTokens } = vi.hoisted(() => ({
	transaction: vi.fn(),
	metadataFromLogs: vi.fn(),
	metadataForTokens: vi.fn(),
}))
vi.mock('wagmi/actions', () => ({
	getTransaction: transaction,
	getBlock: () => ({ timestamp: 1n }),
	getTransactionReceipt: () => ({
		logs: [],
		transactionHash: `0x${'1'.repeat(64)}`,
		blockHash: `0x${'2'.repeat(64)}`,
	}),
}))
vi.mock('#wagmi.config.ts', () => ({
	getWagmiConfig: () => ({}),
	getTempoChain: () => ({ id: 42431 }),
}))
vi.mock('#lib/domain/tip20', () => ({ metadataFromLogs, metadataForTokens }))
vi.mock('#lib/domain/known-events', () => ({
	parseKnownEvents: () => [],
	parseKnownEvent: () => null,
	decodeKnownTransactionCalls: () => [],
	parseAuthorizationEvents: () => [],
	isStreamChannelAddress: () => false,
	STREAM_CHANNELS: [],
}))
vi.mock('#lib/domain/receipt', () => ({ getFeeBreakdown: () => [] }))
vi.mock('#lib/server/immutable-data-cache', () => ({
	withImmutableDataCache: ({ load }: { load: () => unknown }) => load(),
}))

beforeEach(() => {
	vi.resetAllMocks()
	transaction.mockResolvedValue({
		keyAuthorization: { limits: [{ token, limit: 1_000_000_000n }] },
	})
	metadataFromLogs.mockResolvedValue(() => undefined)
})

function fetchData() {
	return new QueryClient().fetchQuery(
		txQueryOptions({ hash: `0x${'1'.repeat(64)}` }),
	)
}

it('reuses metadata from logs to render authorization budgets without another RPC lookup', async () => {
	metadataFromLogs.mockResolvedValue(() => ({ symbol: 'PathUSD', decimals: 6 }))
	const result = await fetchData()
	expect(result.keyTokenMetadata[token]).toEqual({
		symbol: 'PathUSD',
		decimals: 6,
	})
	expect(metadataForTokens).not.toHaveBeenCalled()
})

it('loads metadata for a budget token even if it emitted no logs', async () => {
	metadataForTokens.mockResolvedValue(() => ({
		symbol: 'PathUSD',
		decimals: 6,
	}))
	const result = await fetchData()
	expect(metadataForTokens).toHaveBeenCalledWith([token])
	expect(result.keyTokenMetadata[token]?.decimals).toBe(6)
})

it('keeps the transaction and its exact budget when metadata lookup fails', async () => {
	metadataForTokens.mockRejectedValue(new Error('RPC unavailable'))
	const result = await fetchData()
	expect(result.keyAuthorization?.limits?.[0]?.limit).toBe(1_000_000_000n)
	expect(result.keyTokenMetadata).toEqual({})
})

it('does no authorization metadata work for ordinary transactions', async () => {
	transaction.mockResolvedValue({ type: 'eip1559' })
	const result = await fetchData()
	expect(result.keyAuthorization).toBeUndefined()
	expect(metadataForTokens).not.toHaveBeenCalled()
})
