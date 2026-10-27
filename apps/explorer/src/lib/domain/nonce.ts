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
 * The nonce exactly, given the formatted one and the RPC's hex value.
 * Viem formats nonces as numbers, which rounds the uint64 discriminators
 * expiring nonce transactions may carry since TIP-1106.
 */
export function exactNonce(
	formatted: number,
	rpcNonce: string | null | undefined,
): bigint {
	if (rpcNonce) return BigInt(rpcNonce)
	return BigInt(formatted)
}
