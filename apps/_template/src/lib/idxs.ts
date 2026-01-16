import { Idxs } from 'idxs'

const idxs = new Idxs()

// Tempo chain ID
const TEMPO_CHAIN_ID = 111557750

/**
 * Get recent ERC20 transfers
 */
export async function getTransfers(options: { address?: string; limit?: number } = {}) {
	const { address, limit = 50 } = options

	const result = await idxs.query({
		chain: TEMPO_CHAIN_ID,
		signature: 'event Transfer(address indexed from, address indexed to, uint256 value)',
		address,
		limit,
	})

	return result.map((event) => ({
		blockNumber: event.block_num,
		from: event.from,
		to: event.to,
		value: event.value,
		txHash: event.tx_hash,
	}))
}

/**
 * Get transaction history for an address
 */
export async function getAddressActivity(address: string, limit = 50) {
	const [sent, received] = await Promise.all([
		idxs.query({
			chain: TEMPO_CHAIN_ID,
			signature: 'event Transfer(address indexed from, address indexed to, uint256 value)',
			filter: { from: address.toLowerCase() },
			limit,
		}),
		idxs.query({
			chain: TEMPO_CHAIN_ID,
			signature: 'event Transfer(address indexed from, address indexed to, uint256 value)',
			filter: { to: address.toLowerCase() },
			limit,
		}),
	])

	const all = [...sent, ...received].sort((a, b) => b.block_num - a.block_num)

	return all.slice(0, limit)
}

/**
 * Run a custom SQL query
 */
export async function customQuery(sql: string, eventSignature?: string) {
	return idxs.sql(sql, eventSignature ? { signature: eventSignature } : undefined)
}
