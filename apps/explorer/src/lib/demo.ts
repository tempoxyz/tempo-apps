import type { Address, Hex } from 'ox'
import type {
	Log,
	RpcTransaction as Transaction,
	TransactionReceipt,
} from 'viem'
import { zeroAddress } from 'viem'

export const transactionHash = `0x${'1'.repeat(64)}` as const
export const blockHash = zeroAddress
export const blockNumber = 12345n
export const baseTimestamp = BigInt(Math.floor(Date.now() / 1000))

export const tokenAddress = `0x${'1234567890'.repeat(4)}` as const
export const registryAddress = `0x${'a'.repeat(40)}` as const
export const updaterAddress = `0x${'abcde'.repeat(8)}` as const
export const recipientAddress = `0x${'9'.repeat(40)}` as const
export const adminAddress = `0x${'b'.repeat(40)}` as const
export const spenderAddress = `0x${'c'.repeat(40)}` as const
export const userTokenAddress = `0x${'d'.repeat(40)}` as const
export const validatorTokenAddress = `0x${'e'.repeat(40)}` as const
export const accountAddress = `0x${'f'.repeat(40)}` as const
export const feeAmmAddress = `0x${'1'.repeat(40)}` as const
export const factoryAddress = `0x${'2'.repeat(40)}` as const
export const exchangeAddress = `0x${'3'.repeat(40)}` as const
export const makerAddress = `0x${'4'.repeat(40)}` as const
export const baseTokenAddress = `0x${'5'.repeat(40)}` as const
export const quoteTokenAddress = `0x${'6'.repeat(40)}` as const
export const validatorAddress = `0x${'7'.repeat(40)}` as const

export function mockLog(
	log: Partial<Log>,
	txHash: Hex.Hex = `0x${'1'.repeat(64)}`,
): Log {
	return {
		address: zeroAddress,
		topics: [],
		data: '0x',
		blockHash,
		blockNumber,
		transactionHash: txHash,
		transactionIndex: 0,
		logIndex: 0,
		removed: false,
		...log,
	} as Log
}

export function mockReceipt(
	logs: Log[],
	from: Address.Address,
	txHash: Hex.Hex = `0x${'1'.repeat(64)}`,
): TransactionReceipt {
	return {
		blockHash,
		blockNumber,
		contractAddress: null,
		cumulativeGasUsed: 100000n,
		effectiveGasPrice: 1000000000n,
		from,
		gasUsed: 50000n,
		logs,
		logsBloom: `0x${'0'.repeat(512)}`,
		status: 'success',
		to: logs[0]?.address ?? zeroAddress,
		transactionHash: txHash,
		transactionIndex: 0,
		type: 'eip1559',
	} as TransactionReceipt
}

export function mockTransaction(
	hash: Hex.Hex,
	from: Address.Address,
	to: Address.Address,
	blockNum: bigint,
): Transaction {
	return {
		hash,
		from,
		to,
		blockHash,
		blockNumber: `0x${blockNum.toString(16)}`,
		transactionIndex: '0x0',
		gas: '0x5208',
		gasPrice: '0x3b9aca00',
		maxFeePerGas: '0x77359400',
		maxPriorityFeePerGas: '0x3b9aca00',
		value: '0x0',
		input: '0x',
		nonce: '0x0',
		type: '0x2',
		accessList: [],
		chainId: '0x1',
		yParity: '0x0',
		r: '0x0',
		s: '0x0',
	} as unknown as Transaction
}

export const metadataMap = new Map([
	[
		tokenAddress.toLowerCase(),
		{
			currency: 'USD',
			decimals: 2,
			symbol: 'TEST2',
			name: 'Test Token 2',
			totalSupply: 1000000n,
		},
	],
	[
		userTokenAddress.toLowerCase(),
		{
			currency: 'USD',
			decimals: 6,
			symbol: 'USDC',
			name: 'USD Coin',
			totalSupply: 1000000000000n,
		},
	],
	[
		validatorTokenAddress.toLowerCase(),
		{
			currency: 'USD',
			decimals: 6,
			symbol: 'LINK',
			name: 'Chainlink',
			totalSupply: 1000000000000n,
		},
	],
	[
		baseTokenAddress.toLowerCase(),
		{
			currency: 'USD',
			decimals: 6,
			symbol: 'DAI',
			name: 'Dai Stablecoin',
			totalSupply: 1000000000000n,
		},
	],
	[
		quoteTokenAddress.toLowerCase(),
		{
			currency: 'USD',
			decimals: 6,
			symbol: 'USDT',
			name: 'Tether USD',
			totalSupply: 1000000000000n,
		},
	],
])

export const getTokenMetadata = (address: Address.Address) =>
	metadataMap.get(address.toLowerCase())
