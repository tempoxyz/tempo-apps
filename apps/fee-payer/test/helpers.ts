import { env, exports } from 'cloudflare:workers'
import { Mnemonic, Secp256k1 } from 'ox'
import { createClient, custom } from 'viem'
import { tempo, tempoDevnet, tempoLocalnet, tempoModerato } from 'viem/chains'
import { Account, withRelay } from 'viem/tempo'

export const tempoChain = (() => {
	const e = env.TEMPO_ENV ?? 'localnet'
	if (e === 'moderato' || e === 'testnet') return tempoModerato
	if (e === 'mainnet') return tempo
	if (e === 'devnet') return tempoDevnet
	return tempoLocalnet
})()

export const testMnemonic =
	'test test test test test test test test test test test junk'

export const sponsorAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

export const userAccount = Account.fromSecp256k1(
	Mnemonic.toPrivateKey(testMnemonic, {
		as: 'Hex',
		path: Mnemonic.path({ account: 9 }),
	}),
)

export function createTestAccount(): typeof userAccount {
	return Account.fromSecp256k1(Secp256k1.randomPrivateKey())
}

/** Routes RPC calls through the in-process fee-payer Worker at `path`. */
export function feePayerTransport(
	path: string,
	headers: Record<string, string> = {},
) {
	return custom({
		async request({ method, params }) {
			const response = await exports.default.fetch(
				new Request(`https://fee-payer.test${path}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', ...headers },
					body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
				}),
			)
			const data = (await response.json()) as {
				result?: unknown
				error?: string | { message?: string }
			}
			if (data.error) {
				const message =
					typeof data.error === 'string'
						? data.error
						: data.error.message || 'RPC Error'
				throw new Error(message)
			}
			return data.result
		},
	})
}

/** Routes RPC calls directly to the configured Tempo node. */
export function tempoTransport() {
	return custom({
		async request({ method, params }) {
			const response = await fetch(env.TEMPO_RPC_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
			})
			const data = (await response.json()) as {
				result?: unknown
				error?: { message: string }
			}
			if (data.error) throw new Error(data.error.message || 'RPC Error')
			return data.result
		},
	})
}

/** Build a sponsorship client routed through `/${key}`. */
export function buildSponsorClient(
	key: string,
	account: typeof userAccount = userAccount,
) {
	return createClient({
		account,
		chain: tempoChain,
		transport: withRelay(tempoTransport(), feePayerTransport(`/${key}`), {
			policy: 'sign-and-broadcast',
		}),
	})
}

/** Build a sponsorship client routed through `/` with an Authorization bearer key. */
export function buildSponsorClientWithAuthorization(
	key: string,
	account: typeof userAccount = userAccount,
) {
	return createClient({
		account,
		chain: tempoChain,
		transport: withRelay(
			tempoTransport(),
			feePayerTransport('/', { Authorization: `Bearer ${key}` }),
			{
				policy: 'sign-and-broadcast',
			},
		),
	})
}
