import { type Chain, formatBlock } from 'viem'

/** Nonce key that marks an expiring nonce transaction (TIP-1009). */
export const expiringNonceKey = 2n ** 256n - 1n

/** Most significant byte of a sub-block transaction's nonce key. */
export const subblockNonceKeyPrefix = 0x5bn

/** Whether a nonce key belongs to a sub-block transaction. */
export function isSubblockNonceKey(nonceKey: bigint | undefined): boolean {
	if (nonceKey === undefined) return false
	return nonceKey >> 248n === subblockNonceKeyPrefix
}

/**
 * Reads a transaction's nonce key from a formatted transaction, whose
 * mixed-chain type omits Tempo's fields.
 */
export function getNonceKey(transaction: object): bigint | undefined {
	if (!('nonceKey' in transaction)) return undefined
	const { nonceKey } = transaction
	if (typeof nonceKey === 'bigint') return nonceKey
	if (typeof nonceKey === 'string' && nonceKey) return BigInt(nonceKey)
	return undefined
}

/**
 * The exact nonce from the RPC's hex value, or undefined when the lookup
 * failed. Viem formats nonces as numbers, which rounds the uint64
 * discriminators expiring nonce transactions may carry since TIP-1106.
 */
export function exactNonce(
	rpcNonce: string | null | undefined,
): bigint | undefined {
	if (!rpcNonce) return undefined
	return BigInt(rpcNonce)
}

const maxSafeNonce = BigInt(Number.MAX_SAFE_INTEGER)

type RpcWithNonce = { nonce?: unknown }

/**
 * Zeroes an RPC nonce viem cannot format: its formatters throw on values
 * above 2^53, which TIP-1106 expiring nonce discriminators often are.
 * Returns the sanitized payload and the nonce to restore, rounded.
 */
function splitUnsafeNonce<value>(rpc: value): [value, number | undefined] {
	const nonce = (rpc as RpcWithNonce | null)?.nonce
	if (typeof nonce !== 'string' || !nonce.startsWith('0x'))
		return [rpc, undefined]
	const exact = BigInt(nonce)
	if (exact <= maxSafeNonce) return [rpc, undefined]
	return [{ ...rpc, nonce: '0x0' }, Number(exact)]
}

/**
 * The chain with transaction and block formatters that accept nonces above
 * 2^53 instead of throwing, so pages with such transactions load. The
 * formatted nonce is rounded; read the RPC's hex value where it is shown.
 */
export function withLargeNonces<chain extends Chain>(chain: chain): chain {
	const transaction = chain.formatters?.transaction
	const block = chain.formatters?.block
	const formatTransaction = transaction?.format
	const formatBlockWith = block?.format ?? formatBlock
	return {
		...chain,
		formatters: {
			...chain.formatters,
			...(transaction && formatTransaction
				? {
						transaction: {
							...transaction,
							format: (args: never, action?: string) => {
								const [safe, nonce] = splitUnsafeNonce(args)
								const formatted = formatTransaction(safe, action)
								return nonce === undefined ? formatted : { ...formatted, nonce }
							},
						},
					}
				: {}),
			block: {
				...block,
				type: 'block',
				format: (args: never, action?: string) => {
					const rpcBlock = args as { transactions?: unknown }
					if (!Array.isArray(rpcBlock.transactions))
						return formatBlockWith(args, action)
					const nonces: (number | undefined)[] = []
					const transactions = rpcBlock.transactions.map((tx) => {
						const [safe, nonce] = splitUnsafeNonce(tx)
						nonces.push(nonce)
						return safe
					})
					const formatted = formatBlockWith(
						{ ...rpcBlock, transactions } as never,
						action,
					) as { transactions: unknown[] }
					if (nonces.every((nonce) => nonce === undefined)) return formatted
					return {
						...formatted,
						transactions: formatted.transactions.map((tx, index) => {
							const nonce = nonces[index]
							return nonce === undefined || typeof tx !== 'object'
								? tx
								: { ...tx, nonce }
						}),
					}
				},
			},
		},
	} as chain
}
