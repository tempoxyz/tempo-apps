import { tempoDevnet as tempoDevnet_, tempo, tempoModerato } from 'viem/chains'
import { alphausd, pathusd } from 'viem/tokens'
import { ZONE_PROVER_CHAIN_ID, ZONE_PROVER_EXPLORER_URL } from './zone-prover'
import { MULTISIG_EXPLORER_URL } from './multisig'

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

export const tempoNextfork = tempoDevnet_.extend({
	feeToken: '0x20c0000000000000000000000000000000000002',
	rpcUrls: {
		default: {
			http: ['https://rpc-nextfork.devnet.tempoxyz.dev'],
		},
	},
})

export const tempoMultisig = tempoDevnet_.extend({
	feeToken: '0x20c0000000000000000000000000000000000002',
	name: 'Tempo Multisig Devnet',
	rpcUrls: {
		default: { http: [`${MULTISIG_EXPLORER_URL}/api/rpc`] },
	},
	blockExplorers: {
		default: { name: 'Tempo Multisig Explorer', url: MULTISIG_EXPLORER_URL },
	},
})
