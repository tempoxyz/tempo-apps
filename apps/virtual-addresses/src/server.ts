import { Hono } from 'hono'
import {
	createPublicClient,
	createWalletClient,
	http,
	formatUnits,
	parseUnits,
	keccak256,
	encodePacked,
	type Address,
	type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoLocalnet } from 'viem/chains'
import { Actions, tempoActions } from 'viem/tempo'
import {
	virtualRegistryAbi,
	tip20Abi,
	VIRTUAL_REGISTRY_ADDRESS,
	PATH_USD_ADDRESS,
} from '#lib/abi'

const FUND_AMOUNT = parseUnits('10000', 18)

type Env = {
	Bindings: {
		ASSETS: Fetcher
		EXCHANGE_PRIVATE_KEY: string
		SENDER_PRIVATE_KEY: string
		EXPLORER_URL: string
		RPC_URL: string
	}
}

const app = new Hono<Env>()

function getRpcUrl(c: { env: Env['Bindings'] }): string {
	// In local dev, workerd can't reach localhost — use vite's /rpc proxy
	// In production, use the configured RPC_URL
	return c.env.RPC_URL || 'http://localhost:8545'
}

function requireKeys(c: { env: Env['Bindings'] }) {
	if (!c.env.EXCHANGE_PRIVATE_KEY || !c.env.SENDER_PRIVATE_KEY) {
		return { ok: false as const }
	}
	return {
		ok: true as const,
		exchange: privateKeyToAccount(c.env.EXCHANGE_PRIVATE_KEY as Hex),
		sender: privateKeyToAccount(c.env.SENDER_PRIVATE_KEY as Hex),
	}
}

const MISSING_KEYS_MSG =
	'EXCHANGE_PRIVATE_KEY and SENDER_PRIVATE_KEY must be set. Add them to .dev.vars for local dev or as Worker secrets for production.'

app.get('/api/health', (c) => c.json({ ok: true }))

app.post('/api/demo/register', async (c) => {
	const keys = requireKeys(c)
	if (!keys.ok) return c.json({ error: MISSING_KEYS_MSG }, 500)

	const { salt } = (await c.req.json()) as { salt: Hex }
	const rpcUrl = getRpcUrl(c)

	try {
		const publicClient = createPublicClient({
			chain: tempoLocalnet,
			transport: http(rpcUrl),
		})

		const hash = keccak256(
			encodePacked(['address', 'bytes32'], [keys.exchange.address, salt]),
		)
		const masterId = `0x${hash.slice(10, 18)}` as Hex

		let alreadyRegistered = false
		try {
			const existingMaster = (await publicClient.readContract({
				address: VIRTUAL_REGISTRY_ADDRESS,
				abi: virtualRegistryAbi,
				functionName: 'getMaster',
				args: [masterId],
			})) as Address
			const zeroAddr = '0x0000000000000000000000000000000000000000'
			alreadyRegistered = existingMaster.toLowerCase() !== zeroAddr
		} catch {
			// getMaster returns empty for unregistered
		}

		if (alreadyRegistered) {
			return c.json({
				txHash: null,
				blockNumber: null,
				masterId,
				exchangeAddress: keys.exchange.address,
				alreadyRegistered: true,
			})
		}

		const walletClient = createWalletClient({
			account: keys.exchange,
			chain: tempoLocalnet,
			transport: http(rpcUrl),
		})

		const txHash = await walletClient.writeContract({
			address: VIRTUAL_REGISTRY_ADDRESS,
			abi: virtualRegistryAbi,
			functionName: 'registerVirtualMaster',
			args: [salt],
		})

		const receipt = await publicClient.waitForTransactionReceipt({
			hash: txHash,
		})

		return c.json({
			txHash,
			blockNumber: Number(receipt.blockNumber),
			masterId,
			exchangeAddress: keys.exchange.address,
			alreadyRegistered: false,
		})
	} catch {
		return c.json({ error: 'Node unreachable' }, 503)
	}
})

app.post('/api/demo/transfer', async (c) => {
	const keys = requireKeys(c)
	if (!keys.ok) return c.json({ error: MISSING_KEYS_MSG }, 500)

	const { virtualAddress, amount } = (await c.req.json()) as {
		virtualAddress: Address
		amount: string
	}
	const rpcUrl = getRpcUrl(c)

	try {
		const walletClient = createWalletClient({
			account: keys.sender,
			chain: tempoLocalnet,
			transport: http(rpcUrl),
		})

		const publicClient = createPublicClient({
			chain: tempoLocalnet,
			transport: http(rpcUrl),
		})

		const parsedAmount = parseUnits(amount, 18)

		const hash = await walletClient.writeContract({
			address: PATH_USD_ADDRESS,
			abi: tip20Abi,
			functionName: 'transfer',
			args: [virtualAddress, parsedAmount],
		})

		const receipt = await publicClient.waitForTransactionReceipt({ hash })

		const events = receipt.logs
			.filter(
				(log) =>
					log.address.toLowerCase() === PATH_USD_ADDRESS.toLowerCase() &&
					log.topics[0] ===
						'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
			)
			.map((log) => ({
				from: `0x${log.topics[1]?.slice(26) ?? ''}` as Address,
				to: `0x${log.topics[2]?.slice(26) ?? ''}` as Address,
				amount: formatUnits(BigInt(log.data), 18),
			}))

		return c.json({
			txHash: hash,
			blockNumber: Number(receipt.blockNumber),
			events,
		})
	} catch {
		return c.json({ error: 'Node unreachable' }, 503)
	}
})

app.get('/api/demo/balance', async (c) => {
	const keys = requireKeys(c)
	if (!keys.ok) {
		return c.json({
			exchange: '0',
			sender: '0',
			virtual: '0',
			exchangeAddress: null,
			senderAddress: null,
		})
	}

	const rpcUrl = getRpcUrl(c)
	const virtualAddress = c.req.query('virtualAddress') as Address | undefined

	const publicClient = createPublicClient({
		chain: tempoLocalnet,
		transport: http(rpcUrl),
	})

	try {
		const [exchangeBal, senderBal] = await Promise.all([
			publicClient.readContract({
				address: PATH_USD_ADDRESS,
				abi: tip20Abi,
				functionName: 'balanceOf',
				args: [keys.exchange.address],
			}),
			publicClient.readContract({
				address: PATH_USD_ADDRESS,
				abi: tip20Abi,
				functionName: 'balanceOf',
				args: [keys.sender.address],
			}),
		])

		let virtualBal = 0n
		if (virtualAddress) {
			virtualBal = (await publicClient.readContract({
				address: PATH_USD_ADDRESS,
				abi: tip20Abi,
				functionName: 'balanceOf',
				args: [virtualAddress],
			})) as bigint
		}

		return c.json({
			exchange: formatUnits(exchangeBal as bigint, 18),
			sender: formatUnits(senderBal as bigint, 18),
			virtual: formatUnits(virtualBal, 18),
			exchangeAddress: keys.exchange.address,
			senderAddress: keys.sender.address,
		})
	} catch {
		return c.json({
			exchange: '0',
			sender: '0',
			virtual: '0',
			exchangeAddress: keys.exchange.address,
			senderAddress: keys.sender.address,
		})
	}
})

app.post('/api/fund', async (c) => {
	const keys = requireKeys(c)
	if (!keys.ok) return c.json({ error: MISSING_KEYS_MSG }, 500)

	const { address } = (await c.req.json()) as { address?: Address }
	const rpcUrl = getRpcUrl(c)

	const walletClient = createWalletClient({
		account: keys.exchange,
		chain: tempoLocalnet,
		transport: http(rpcUrl),
	}).extend(tempoActions())

	const publicClient = createPublicClient({
		chain: tempoLocalnet,
		transport: http(rpcUrl),
	}).extend(tempoActions())

	const targets = [keys.exchange.address, keys.sender.address]
	if (address) targets.push(address)

	try {
		const funded: string[] = []

		for (const target of targets) {
			const bal = (await publicClient.readContract({
				address: PATH_USD_ADDRESS,
				abi: tip20Abi,
				functionName: 'balanceOf',
				args: [target],
			})) as bigint

			if (bal < FUND_AMOUNT / 2n) {
				await publicClient
					.request({
						method: 'tempo_fundAddress' as 'eth_chainId',
						params: [target as `0x${string}`] as never,
					})
					.catch(() => {})

				await Actions.token.mint(walletClient, {
					token: PATH_USD_ADDRESS,
					to: target,
					amount: FUND_AMOUNT,
				})
				funded.push(target)
			}
		}

		return c.json({ funded })
	} catch {
		return c.json({ funded: [], error: 'Node unreachable' }, 503)
	}
})

app.all('*', async (c) => {
	return c.env.ASSETS.fetch(c.req.raw)
})

export default app
