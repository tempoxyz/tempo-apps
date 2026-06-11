import { env, exports } from 'cloudflare:workers'
import { Mnemonic } from 'ox'
import { custom } from 'viem'
import { tempo, tempoDevnet, tempoLocalnet, tempoModerato } from 'viem/chains'
import { Account } from 'viem/tempo'

export const tempoChain = (() => {
	const e = env.TEMPO_ENV ?? 'localnet'
	if (e === 'moderato' || e === 'testnet') return tempoModerato
	if (e === 'mainnet') return tempo
	if (e === 'devnet') return tempoDevnet
	return tempoLocalnet
})()

export const testMnemonic =
	'test test test test test test test test test test test junk'

export const feeToken = '0x20c0000000000000000000000000000000000000'

export const sponsorAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

export const recipient = Account.fromSecp256k1(
	Mnemonic.toPrivateKey(testMnemonic, {
		as: 'Hex',
		path: Mnemonic.path({ account: 9 }),
	}),
)

export function multisigRelayTransport(path: string) {
	return custom({
		async request({ method, params }) {
			const response = await exports.default.fetch(
				new Request(`https://native-multisig-relay.test${path}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
				}),
			)
			const data = (await response.json()) as {
				result?: unknown
				error?: string | { code?: number; message?: string }
			}
			if (data.error) {
				const message =
					typeof data.error === 'string'
						? data.error
						: (data.error.message ?? JSON.stringify(data.error))
				throw new Error(message)
			}
			return data.result
		},
	})
}
