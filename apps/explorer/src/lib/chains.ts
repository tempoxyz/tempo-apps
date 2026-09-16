import { tempoDevnet as tempoDevnet_, tempo, tempoModerato } from 'viem/chains'
import { ZONE_PROVER_EXPLORER_URL } from './zone-prover'

export const tempoZoneProver = tempoDevnet_.extend({
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
	feeToken: '0x20c0000000000000000000000000000000000000',
})

export const tempoTestnet = tempoModerato.extend({
	feeToken: '0x20c0000000000000000000000000000000000001',
})

export const tempoDevnet = tempoDevnet_.extend({
	feeToken: '0x20c0000000000000000000000000000000000002',
})

export const tempoNextfork = tempoDevnet_.extend({
	feeToken: '0x20c0000000000000000000000000000000000002',
	rpcUrls: {
		default: {
			http: ['https://rpc-nextfork.devnet.tempoxyz.dev'],
		},
	},
})
