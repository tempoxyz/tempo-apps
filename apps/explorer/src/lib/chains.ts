import { tempoDevnet as tempoDevnet_, tempo, tempoModerato } from 'viem/chains'

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
