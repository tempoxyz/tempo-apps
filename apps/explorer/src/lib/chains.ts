import { SignatureEnvelope } from 'ox/tempo'
import { tempoDevnet as tempoDevnet_, tempo, tempoModerato } from 'viem/chains'
import { alphausd, pathusd } from 'viem/tokens'
import { ZONE_PROVER_CHAIN_ID, ZONE_PROVER_EXPLORER_URL } from './zone-prover'

export const tempoZoneProver = tempoDevnet_.extend({
	id: ZONE_PROVER_CHAIN_ID,
	feeToken: '0x20c0000000000000000000000000000000000002',
	name: 'Tempo Prover Devnet',
	rpcUrls: { default: { http: [`${ZONE_PROVER_EXPLORER_URL}/api/rpc`] } },
	blockExplorers: {
		default: {
			name: 'Tempo Prover Explorer',
			url: ZONE_PROVER_EXPLORER_URL,
		},
	},
})

export const tempoMainnet = tempo.extend({
	feeToken: pathusd.addresses[tempo.id],
})

export const tempoTestnet = tempoModerato.extend({
	feeToken: alphausd.addresses[tempoModerato.id],
})

export const tempoDevnet = tempoDevnet_.extend({
	feeToken: '0x20c0000000000000000000000000000000000002',
})

/**
 * Chain ID of the devnet a `devnet` build connects to: 31318, or the build's
 * compiled-in `DEVNET_CHAIN_ID` (e.g. 1337 for a local `--chain dev` node).
 */
export const devnetChainId = import.meta.env.DEVNET_CHAIN_ID
	? Number(import.meta.env.DEVNET_CHAIN_ID)
	: tempoDevnet_.id

/**
 * The devnet chain the app connects with: viem's, without its public
 * WebSocket when the build points at another devnet's RPC
 * (`VITE_DEVNET_RPC_OVERRIDDEN`), so the head is polled through `/api/rpc`.
 */
export const connectedTempoDevnet =
	import.meta.env.VITE_DEVNET_RPC_OVERRIDDEN === 'true'
		? withUndecodedSignatures({
				...tempoDevnet_,
				id: devnetChainId,
				rpcUrls: { default: { http: tempoDevnet_.rpcUrls.default.http } },
			})
		: tempoDevnet_

type RpcTransaction = { signature?: unknown } & Record<string, unknown>

/** Whether ox can decode a transaction's RPC signature. */
export function hasDecodableSignature(transaction: RpcTransaction): boolean {
	if (!transaction.signature) return true
	try {
		SignatureEnvelope.fromRpc(transaction.signature as never)
		return true
	} catch {
		return false
	}
}

/** The transaction without a signature ox cannot decode. */
export function withoutUndecodableSignature<transaction>(
	transaction: transaction,
) {
	if (typeof transaction !== 'object' || transaction === null)
		return transaction
	if (hasDecodableSignature(transaction as RpcTransaction)) return transaction
	return { ...transaction, signature: undefined }
}

/**
 * A chain whose transaction and block formatters keep a transaction whose
 * signature ox cannot decode (such as an owner-approval type a development
 * node supports before ox does), with `signature` left undefined, instead of
 * failing the whole request. The explorer decodes signatures itself from the
 * raw transaction (`#lib/domain/tempo-signature`).
 */
function withUndecodedSignatures<
	chain extends { formatters: typeof tempoDevnet_.formatters },
>(chain: chain): chain {
	const { block, transaction } = chain.formatters
	return {
		...chain,
		formatters: {
			...chain.formatters,
			block: {
				...block,
				format: (value: Parameters<typeof block.format>[0], action?: string) =>
					block.format(
						{
							...value,
							transactions: value.transactions?.map(
								withoutUndecodableSignature,
							),
						} as typeof value,
						action,
					),
			},
			transaction: {
				...transaction,
				format: (
					value: Parameters<typeof transaction.format>[0],
					action?: string,
				) => transaction.format(withoutUndecodableSignature(value), action),
			},
		},
	} as chain
}

export const tempoNextfork = tempoDevnet_.extend({
	feeToken: '0x20c0000000000000000000000000000000000002',
	rpcUrls: {
		default: {
			http: ['https://rpc-nextfork.devnet.tempoxyz.dev'],
		},
	},
})
