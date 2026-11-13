import { tempoDevnet as tempoDevnet_, tempo, tempoModerato } from 'viem/chains'
import { alphausd, pathusd } from 'viem/tokens'
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
 * The devnet chain the app connects with: viem's, without its public
 * WebSocket when the build points at another devnet's RPC
 * (`VITE_DEVNET_RPC_OVERRIDDEN`), so the head is polled through `/api/rpc`.
 */
export const connectedTempoDevnet =
	import.meta.env.VITE_DEVNET_RPC_OVERRIDDEN === 'true'
		? {
				...tempoDevnet_,
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
