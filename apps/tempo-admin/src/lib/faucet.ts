import { env } from 'cloudflare:workers'
import {
	type Address,
	createWalletClient,
	http,
	parseEther,
	publicActions,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempo } from 'viem/chains'

export async function dispenseFunds(params: {
	recipient: Address
	amount: string
}): Promise<string> {
	const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`)

	const client = createWalletClient({
		account,
		chain: tempo,
		transport: http(env.TEMPO_RPC_URL),
	}).extend(publicActions)

	const hash = await client.sendTransaction({
		to: params.recipient,
		value: parseEther(params.amount),
	})

	return hash
}

export async function getFaucetBalance(): Promise<string> {
	const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`)

	const client = createWalletClient({
		account,
		chain: tempo,
		transport: http(env.TEMPO_RPC_URL),
	}).extend(publicActions)

	const balance = await client.getBalance({ address: account.address })
	return balance.toString()
}
