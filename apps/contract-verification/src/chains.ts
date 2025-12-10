import { tempoDevnet, tempoTestnet } from 'tempo.ts/chains'

export const DEVNET_CHAIN_ID = tempoDevnet.id
export const TESTNET_CHAIN_ID = tempoTestnet.id

const chains = {
	[tempoDevnet.id]: tempoDevnet,
	[tempoTestnet.id]: tempoTestnet,
}

export { chains }
