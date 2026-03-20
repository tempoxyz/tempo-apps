import { tempoDevnet, tempoModerato as tempoTestnet, tempo } from 'viem/chains'

export const tempoMainnet = tempo.extend({
	feeToken: '0x20c0000000000000000000000000000000000000',
})

export const CHAIN_IDS = [
	tempoDevnet.id,
	tempoTestnet.id,
	tempoMainnet.id,
] as const

export const chains = {
	[tempoDevnet.id]: tempoDevnet,
	[tempoTestnet.id]: tempoTestnet,
	[tempoMainnet.id]: tempoMainnet,
}
