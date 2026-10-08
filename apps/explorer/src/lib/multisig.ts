export const MULTISIG_CHAIN_ID = 31318
export const MULTISIG_EXPLORER_URL =
	'https://explore.multisig1.devnet.tempo.xyz'
export const MULTISIG_RPC_URL = 'https://rpc-multisig1.devnet.tempoxyz.dev'

export function isMultisigExplorer() {
	return import.meta.env.VITE_TEMPO_ENV === 'multisig1'
}
