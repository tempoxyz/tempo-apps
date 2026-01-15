import { type Address, createClient, http, parseUnits } from 'viem'
import { Account, tempoActions } from 'viem/tempo'
import { type Environment, getChainForEnvironment } from './chains.js'

export type { Environment }

export type SendTestnetFundsParams = {
	senderPrivateKey: string
	tokenAddress: string
	destinationAddress: Address
	amount: number
	environment: Environment
	rpcAuth?: string
}

export type SendTestnetFundsResult = {
	txHash: string
	amount: number
	destinationAddress: string
}

export async function sendTestnetFunds(
	params: SendTestnetFundsParams,
): Promise<SendTestnetFundsResult> {
	const {
		senderPrivateKey,
		tokenAddress,
		destinationAddress,
		amount,
		environment,
		rpcAuth,
	} = params

	const account = Account.fromSecp256k1(senderPrivateKey as `0x${string}`)
	const chain = getChainForEnvironment(environment)

	const transport = http(undefined, {
		fetchOptions: rpcAuth
			? { headers: { Authorization: `Basic ${btoa(rpcAuth)}` } }
			: undefined,
	})

	const client = createClient({
		account,
		chain,
		transport,
	}).extend(tempoActions())

	const amountInTokenUnits = parseUnits(amount.toString(), 6)

	console.log('[Onramp] Sending Tempo token transfer:', {
		to: destinationAddress,
		amount,
		amountInTokenUnits: amountInTokenUnits.toString(),
		token: tokenAddress,
		chain: chain.name,
		chainId: chain.id,
		sender: account.address,
	})

	const result = await client.token.transferSync({
		token: tokenAddress as Address,
		to: destinationAddress,
		amount: amountInTokenUnits,
	})

	console.log('[Onramp] Transaction confirmed:', {
		txHash: result.receipt.transactionHash,
		blockNumber: result.receipt.blockNumber.toString(),
		to: destinationAddress,
		amount,
		token: tokenAddress,
		status: result.receipt.status,
	})

	return {
		txHash: result.receipt.transactionHash,
		amount,
		destinationAddress,
	}
}

export type IdempotencyStore = {
	get(key: string): Promise<string | null>
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void>
}

export async function processWithIdempotency(
	store: IdempotencyStore,
	paymentIntentId: string,
	processor: () => Promise<SendTestnetFundsResult>,
): Promise<SendTestnetFundsResult | null> {
	const existing = await store.get(paymentIntentId)
	if (existing) {
		console.log('[Idempotency] Already processed:', paymentIntentId)
		if (existing === 'processing' || existing === 'failed') {
			return null
		}
		return JSON.parse(existing) as SendTestnetFundsResult
	}

	await store.put(paymentIntentId, 'processing', { expirationTtl: 86400 })

	try {
		const result = await processor()
		await store.put(paymentIntentId, JSON.stringify(result), {
			expirationTtl: 86400 * 30,
		})
		return result
	} catch (error) {
		await store.put(paymentIntentId, 'failed', { expirationTtl: 3600 })
		throw error
	}
}
