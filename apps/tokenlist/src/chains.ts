import { tempoDevnet, tempo } from 'viem/chains'

export const tempoMainnet = tempo.extend({
	name: 'Tempo Mainnet',
	feeToken: '0x20c0000000000000000000000000000000000000',
})

export const tempoTestnet = {
	id: 42431,
	name: 'Tempo Testnet',
} as const

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
