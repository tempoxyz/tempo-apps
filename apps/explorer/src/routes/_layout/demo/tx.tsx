import { createFileRoute, notFound } from '@tanstack/react-router'
import { type Address, Hex } from 'ox'
import { Abis } from 'tempo.ts/viem'
import type { Log, TransactionReceipt } from 'viem'
import { encodeAbiParameters, encodeEventTopics, zeroAddress } from 'viem'
import { Receipt } from '#components/Receipt/Receipt'
import { parseKnownEvents } from '#lib/known-events'

const transactionHash = `0x${'1'.repeat(64)}` as const
const blockHash = zeroAddress
const blockNumber = 12345n

function mockLog(log: Partial<Log>): Log {
	return {
		address: zeroAddress,
		topics: [],
		data: '0x',
		blockHash,
		blockNumber,
		transactionHash,
		transactionIndex: 0,
		logIndex: 0,
		removed: false,
		...log,
	} as Log
}

function mockReceipt(logs: Log[], from: Address.Address): TransactionReceipt {
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
		transactionHash,
		transactionIndex: 0,
		type: 'eip1559',
	} as TransactionReceipt
}

const tokenAddress = `0x${'1234567890'.repeat(4)}` as const
const registryAddress = `0x${'a'.repeat(40)}` as const
const updaterAddress = `0x${'abcde'.repeat(8)}` as const
const recipientAddress = `0x${'9'.repeat(40)}` as const
const adminAddress = `0x${'b'.repeat(40)}` as const

const transferWithMemoEvent = Abis.tip20.find(
	(e) => e.type === 'event' && e.name === 'TransferWithMemo',
)
if (!transferWithMemoEvent) throw new Error()

const supplyCapUpdateEvent = Abis.tip20.find(
	(e) => e.type === 'event' && e.name === 'SupplyCapUpdate',
)
if (!supplyCapUpdateEvent) throw new Error()

const rewardScheduledEvent = Abis.tip20.find(
	(e) => e.type === 'event' && e.name === 'RewardScheduled',
)
if (!rewardScheduledEvent) throw new Error()

const policyAdminUpdatedEvent = Abis.tip403Registry.find(
	(e) => e.type === 'event' && e.name === 'PolicyAdminUpdated',
)
if (!policyAdminUpdatedEvent) throw new Error()

function loader() {
	if (import.meta.env.VITE_ENABLE_DEMO !== 'true') throw notFound()

	const tokenMetadata = new Map([
		[tokenAddress, { decimals: 2, symbol: 'TEST2' }],
	])

	const receipt = mockReceipt(
		[
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: [transferWithMemoEvent],
					eventName: 'TransferWithMemo',
					args: {
						from: updaterAddress,
						to: recipientAddress,
						memo: Hex.padLeft(Hex.fromString('Thanks for the coffee.'), 32),
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [150000n]),
			}),
			mockLog({
				address: registryAddress,
				topics: encodeEventTopics({
					abi: [policyAdminUpdatedEvent],
					eventName: 'PolicyAdminUpdated',
					args: {
						policyId: 20n,
						updater: updaterAddress,
						admin: adminAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: [supplyCapUpdateEvent],
					eventName: 'SupplyCapUpdate',
					args: {
						updater: updaterAddress,
						newSupplyCap: 1000000000000000n,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: [rewardScheduledEvent],
					eventName: 'RewardScheduled',
					args: {
						funder: updaterAddress,
						id: 123n,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters(
					[{ type: 'uint256' }, { type: 'uint32' }],
					[5000000n, 604800],
				),
			}),
		],
		updaterAddress,
	)

	const knownEvents = parseKnownEvents(receipt, { tokenMetadata })

	return {
		blockNumber,
		sender: updaterAddress,
		hash: transactionHash,
		timestamp: BigInt(Math.floor(Date.now() / 1000)),
		events: knownEvents,
		fee: 0.05,
		feeDisplay: '$0.05',
		total: 0.05,
		totalDisplay: '$0.05',
	}
}

export const Route = createFileRoute('/_layout/demo/tx')({
	component: Component,
	loader,
})

function Component() {
	const data = Route.useLoaderData()

	return (
		<div className="font-mono text-[13px] flex flex-col items-center justify-center gap-8 pt-16 pb-8 grow">
			<Receipt {...data} />
		</div>
	)
}
