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
import { tempoModerato } from 'viem/chains'
import {
	virtualRegistryAbi,
	tip20Abi,
	VIRTUAL_REGISTRY_ADDRESS,
	PATH_USD_ADDRESS,
} from '#lib/abi'

type Env = {
	Bindings: {
		ASSETS: Fetcher
		EXCHANGE_PRIVATE_KEY: string
		SENDER_PRIVATE_KEY: string
		EXPLORER_URL: string
	}
}

const app = new Hono<Env>()

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

	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http(),
	})

	// Compute expected masterId: keccak256(encodePacked(address, salt)) → bytes[4:8]
	const hash = keccak256(
		encodePacked(['address', 'bytes32'], [keys.exchange.address, salt]),
	)
	const masterId = `0x${hash.slice(10, 18)}` as Hex // bytes[4:8]

	// Check if already registered
	const existingMaster = (await publicClient.readContract({
		address: VIRTUAL_REGISTRY_ADDRESS,
		abi: virtualRegistryAbi,
		functionName: 'getMaster',
		args: [masterId],
	})) as Address

	const zeroAddr = '0x0000000000000000000000000000000000000000'
	if (existingMaster.toLowerCase() !== zeroAddr) {
		return c.json({
			txHash: null,
			blockNumber: null,
			masterId,
			exchangeAddress: keys.exchange.address,
			alreadyRegistered: true,
		})
	}

	// Not registered yet — register on-chain
	const walletClient = createWalletClient({
		account: keys.exchange,
		chain: tempoModerato,
		transport: http(),
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
})

app.post('/api/demo/transfer', async (c) => {
	const keys = requireKeys(c)
	if (!keys.ok) return c.json({ error: MISSING_KEYS_MSG }, 500)

	const { virtualAddress, amount } = (await c.req.json()) as {
		virtualAddress: Address
		amount: string
	}

	const walletClient = createWalletClient({
		account: keys.sender,
		chain: tempoModerato,
		transport: http(),
	})

	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http(),
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

	const virtualAddress = c.req.query('virtualAddress') as Address | undefined

	const publicClient = createPublicClient({
		chain: tempoModerato,
		transport: http(),
	})

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
})

app.all('*', async (c) => {
	return c.env.ASSETS.fetch(c.req.raw)
})

export default app
