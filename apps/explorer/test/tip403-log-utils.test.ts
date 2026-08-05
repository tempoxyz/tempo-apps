import { describe, expect, it } from 'vitest'
import {
	dedupePolicyLogs,
	fetchAllPolicyLogPages,
	fetchRecentUniquePolicyLogs,
} from '#lib/server/tip403-log-utils'

type Log = { tx_hash: string; log_idx: number }

const logs: Log[] = [
	{ tx_hash: '0xaaa', log_idx: 0 },
	{ tx_hash: '0xaaa', log_idx: 0 },
	{ tx_hash: '0xbbb', log_idx: 1 },
	{ tx_hash: '0xccc', log_idx: 2 },
	{ tx_hash: '0xddd', log_idx: 3 },
]

describe('TIP-403 policy log helpers', () => {
	it('deduplicates logs by transaction hash and log index', () => {
		expect(dedupePolicyLogs(logs)).toEqual([logs[0], logs[2], logs[3], logs[4]])
	})

	it('reads every page before reconstructing policy state', async () => {
		const offsets: number[] = []
		const result = await fetchAllPolicyLogPages(async (limit, offset) => {
			offsets.push(offset)
			return logs.slice(offset, offset + limit)
		}, 2)

		expect(offsets).toEqual([0, 2, 4])
		expect(result).toEqual([logs[0], logs[2], logs[3], logs[4]])
	})

	it('continues past duplicate rows to fill recent activity', async () => {
		const result = await fetchRecentUniquePolicyLogs(
			async (limit, offset) => logs.slice(offset, offset + limit),
			3,
		)

		expect(result).toEqual([logs[0], logs[2], logs[3]])
	})
})
