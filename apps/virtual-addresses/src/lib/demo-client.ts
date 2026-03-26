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

// Anvil account 0 (exchange) and 1 (sender) — well-known test keys
const EXCHANGE_KEY =
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex
const SENDER_KEY =
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex

const exchangeAccount = privateKeyToAccount(EXCHANGE_KEY)
const senderAccount = privateKeyToAccount(SENDER_KEY)

// Use vite's /rpc proxy to avoid CORS issues (proxies to localhost:8545)
const RPC_URL = '/rpc'

function getPublicClient() {
	return createPublicClient({
		chain: tempoLocalnet,
		transport: http(RPC_URL),
	})
}

function getExchangeWallet() {
	return createWalletClient({
		account: exchangeAccount,
		chain: tempoLocalnet,
		transport: http(RPC_URL),
	}).extend(tempoActions())
}

function getSenderWallet() {
	return createWalletClient({
		account: senderAccount,
		chain: tempoLocalnet,
		transport: http(RPC_URL),
	}).extend(tempoActions())
}

export async function demoRegister(salt: Hex) {
	const publicClient = getPublicClient()

	const hash = keccak256(
		encodePacked(['address', 'bytes32'], [exchangeAccount.address, salt]),
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
		// getMaster returns empty for unregistered — not an error
	}

	if (alreadyRegistered) {
		return {
			txHash: null as string | null,
			blockNumber: null as number | null,
			masterId,
			exchangeAddress: exchangeAccount.address,
			alreadyRegistered: true,
		}
	}

	const walletClient = getExchangeWallet()

	const txHash = await walletClient.writeContract({
		address: VIRTUAL_REGISTRY_ADDRESS,
		abi: virtualRegistryAbi,
		functionName: 'registerVirtualMaster',
		args: [salt],
		type: 'tempo' as never,
	})

	const receipt = await publicClient.waitForTransactionReceipt({
		hash: txHash,
	})

	return {
		txHash,
		blockNumber: Number(receipt.blockNumber),
		masterId,
		exchangeAddress: exchangeAccount.address,
		alreadyRegistered: false,
	}
}

export async function demoTransfer(virtualAddress: Address, amount: string) {
	const walletClient = getSenderWallet()
	const publicClient = getPublicClient()

	const parsedAmount = parseUnits(amount, 18)

	const hash = await walletClient.writeContract({
		address: PATH_USD_ADDRESS,
		abi: tip20Abi,
		functionName: 'transfer',
		args: [virtualAddress, parsedAmount],
		type: 'tempo' as never,
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

	return {
		txHash: hash,
		blockNumber: Number(receipt.blockNumber),
		events,
	}
}

export async function demoBalance(virtualAddress?: Address) {
	const publicClient = getPublicClient()

	const [exchangeBal, senderBal] = await Promise.all([
		publicClient.readContract({
			address: PATH_USD_ADDRESS,
			abi: tip20Abi,
			functionName: 'balanceOf',
			args: [exchangeAccount.address],
		}) as Promise<bigint>,
		publicClient.readContract({
			address: PATH_USD_ADDRESS,
			abi: tip20Abi,
			functionName: 'balanceOf',
			args: [senderAccount.address],
		}) as Promise<bigint>,
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

	return {
		exchange: formatUnits(exchangeBal, 18),
		sender: formatUnits(senderBal, 18),
		virtual: formatUnits(virtualBal, 18),
		exchangeAddress: exchangeAccount.address,
		senderAddress: senderAccount.address,
	}
}

export async function demoFund(address?: Address) {
	const publicClient = getPublicClient().extend(tempoActions())
	const walletClient = getExchangeWallet().extend(tempoActions())

	const targets = [exchangeAccount.address, senderAccount.address]
	if (address) targets.push(address)

	// Fund all accounts with native currency first (required before any tx)
	for (const target of targets) {
		await publicClient
			.request({
				method: 'tempo_fundAddress' as 'eth_chainId',
				params: [target as `0x${string}`] as never,
			})
			.catch(() => {})
	}

	const fundAmount = parseUnits('10000', 18)
	const funded: string[] = []

	for (const target of targets) {
		const bal = (await publicClient.readContract({
			address: PATH_USD_ADDRESS,
			abi: tip20Abi,
			functionName: 'balanceOf',
			args: [target],
		})) as bigint

		if (bal < fundAmount / 2n) {
			await Actions.token.mint(walletClient, {
				token: PATH_USD_ADDRESS,
				to: target,
				amount: fundAmount,
			})
			funded.push(target)
		}
	}

	return { funded }
}
