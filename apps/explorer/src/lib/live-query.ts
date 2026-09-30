import * as z from 'zod/mini'
import { zAddress } from './zod'

export const liveQuerySchema = z.object({
	address: zAddress({ lowercase: true }),
	kind: z.enum(['token-transfers', 'account-transfers', 'transactions']),
	limit: z.prefault(z.coerce.number().check(z.int(), z.gte(1), z.lte(200)), 10),
	account: z.optional(zAddress({ lowercase: true })),
	direction: z.optional(z.enum(['in', 'out'])),
	include: z.prefault(z.enum(['all', 'sent', 'received']), 'all'),
	status: z.optional(z.enum(['success', 'reverted'])),
	after: z.optional(
		z.coerce.number().check(z.int(), z.gte(0), z.lte(253402300799)),
	),
	hideSubmitBatches: z.optional(z.enum(['true', 'false'])),
})
export type LiveQuery = z.infer<typeof liveQuerySchema>
export function buildLiveQueries(options: LiveQuery): string[] {
	const { address, kind, limit } = options
	if (kind === 'transactions') {
		const sides =
			options.include === 'sent'
				? ['from']
				: options.include === 'received'
					? ['to']
					: ['from', 'to']
		return sides.map(
			(side) =>
				`SELECT hash, block_num, idx FROM txs WHERE "${side}" = '${address}'${options.after ? ` AND block_timestamp >= '${new Date(options.after * 1000).toISOString()}'` : ''} ORDER BY block_num DESC, idx DESC LIMIT ${Math.min(limit, 10)}`,
		)
	}
	const account = kind === 'account-transfers' ? address : options.account
	const filters = [
		"topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'",
	]
	if (kind === 'token-transfers') filters.push(`address = '${address}'`)
	const sides = !account
		? [undefined]
		: options.direction === 'in'
			? ['topic2']
			: options.direction === 'out'
				? ['topic1']
				: ['topic1', 'topic2']
	return sides.map(
		(side) =>
			`SELECT address, block_num, tx_hash, log_idx, block_timestamp, topic0, topic1, topic2, data FROM logs WHERE ${[...filters, ...(side && account ? [`${side} = '0x${account.slice(2).padStart(64, '0')}'`] : [])].join(' AND ')} ORDER BY block_num DESC, log_idx DESC LIMIT ${limit}`,
	)
}
