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
		? {
				...tempoDevnet_,
				id: devnetChainId,
				rpcUrls: { default: { http: tempoDevnet_.rpcUrls.default.http } },
			}
		: tempoDevnet_

export const tempoNextfork = tempoDevnet_.extend({
	feeToken: '0x20c0000000000000000000000000000000000002',
	rpcUrls: {
		default: {
			http: ['https://rpc-nextfork.devnet.tempoxyz.dev'],
		},
	},
})
