import { ClientOnly, createFileRoute, notFound } from '@tanstack/react-router'
import { Hex } from 'ox'
import * as React from 'react'
import { Abis } from 'tempo.ts/viem'
import type { RpcTransaction as Transaction, TransactionReceipt } from 'viem'
import { encodeAbiParameters, encodeEventTopics } from 'viem'
import { EventDescription } from '#components/transaction/EventDescription'
import {
	getPerspectiveEvent,
	TransactionFee,
	TransactionTimestamp,
	TransactionTotal,
} from '#components/transaction/TransactionRow.tsx'
import { TruncatedHash } from '#components/transaction/TruncatedHash'
import { DataGrid } from '#components/ui/DataGrid'
import { InfoCard } from '#components/ui/InfoCard'
import { RelativeTime } from '#components/ui/RelativeTime'
import { Sections } from '#components/ui/Sections'
import { cx } from '#cva.config.ts'
import {
	accountAddress,
	adminAddress,
	baseTimestamp,
	baseTokenAddress,
	blockNumber,
	exchangeAddress,
	factoryAddress,
	feeAmmAddress,
	getTokenMetadata,
	makerAddress,
	mockLog,
	mockReceipt,
	mockTransaction,
	quoteTokenAddress,
	recipientAddress,
	registryAddress,
	spenderAddress,
	tokenAddress,
	userTokenAddress,
	validatorTokenAddress,
} from '#lib/demo'
import { type KnownEvent, parseKnownEvents } from '#lib/domain/known-events'
import { useCopy, useMediaQuery } from '#lib/hooks'
import CopyIcon from '~icons/lucide/copy'

type MockTransactionData = {
	hash: Hex.Hex
	transaction: Transaction
	receipt: TransactionReceipt
	block: { timestamp: bigint }
	knownEvents: KnownEvent[]
}

function createMockTransactions(): MockTransactionData[] {
	const transactions: MockTransactionData[] = []

	// Tx 1: Transfer with memo
	{
		const hash = `0x${'a'.repeat(64)}` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'TransferWithMemo',
						args: {
							from: accountAddress,
							to: recipientAddress,
							memo: Hex.padLeft(Hex.fromString('Thanks for the coffee.'), 32),
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [150000n]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			tokenAddress,
			blockNumber,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 60n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 2: Mint event
	{
		const hash = `0x${'b'.repeat(64)}` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Mint',
						args: {
							to: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [500000n]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, adminAddress, hash)
		const transaction = mockTransaction(
			hash,
			adminAddress,
			tokenAddress,
			blockNumber - 10n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 300n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 3: Burn event
	{
		const hash = `0x${'c'.repeat(64)}` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Burn',
						args: {
							from: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [100000n]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			tokenAddress,
			blockNumber - 20n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 600n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 4: Approval
	{
		const hash = `0x${'d'.repeat(64)}` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Approval',
						args: {
							owner: accountAddress,
							spender: spenderAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [1000000n]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			tokenAddress,
			blockNumber - 30n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 1200n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 5: FeeAmm Mint
	{
		const hash = `0x${'e'.repeat(64)}` as const
		const logs = [
			mockLog(
				{
					address: feeAmmAddress,
					topics: encodeEventTopics({
						abi: Abis.feeAmm,
						eventName: 'Mint',
						args: {
							sender: accountAddress,
							userToken: userTokenAddress,
							validatorToken: validatorTokenAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
						[1000000000n, 500000000n, 707106781n],
					),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			feeAmmAddress,
			blockNumber - 40n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 3600n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 6: FeeAmm Burn
	{
		const hash = `0x${'f'.repeat(64)}` as const
		const logs = [
			mockLog(
				{
					address: feeAmmAddress,
					topics: encodeEventTopics({
						abi: Abis.feeAmm,
						eventName: 'Burn',
						args: {
							sender: accountAddress,
							userToken: userTokenAddress,
							validatorToken: validatorTokenAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[
							{ type: 'uint256' },
							{ type: 'uint256' },
							{ type: 'uint256' },
							{ type: 'address' },
						],
						[250000000n, 125000000n, 176776695n, recipientAddress],
					),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			feeAmmAddress,
			blockNumber - 50n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 7200n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 7: Rebalance Swap
	{
		const hash = `0x${'1'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: feeAmmAddress,
					topics: encodeEventTopics({
						abi: Abis.feeAmm,
						eventName: 'RebalanceSwap',
						args: {
							userToken: userTokenAddress,
							validatorToken: validatorTokenAddress,
							swapper: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'uint256' }, { type: 'uint256' }],
						[100000000n, 95000000n],
					),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			feeAmmAddress,
			blockNumber - 60n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 14400n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 8: Order Placed
	{
		const hash = `0x${'2'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: exchangeAddress,
					topics: encodeEventTopics({
						abi: Abis.stablecoinExchange,
						eventName: 'OrderPlaced',
						args: {
							orderId: 123n,
							maker: accountAddress,
							token: baseTokenAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'uint128' }, { type: 'bool' }, { type: 'int16' }],
						[1000000n, true, 100],
					),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			exchangeAddress,
			blockNumber - 70n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 28800n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 9: Order Filled
	{
		const hash = `0x${'3'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: exchangeAddress,
					topics: encodeEventTopics({
						abi: Abis.stablecoinExchange,
						eventName: 'OrderFilled',
						args: {
							orderId: 123n,
							maker: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'uint128' }, { type: 'bool' }],
						[500000n, false],
					),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			makerAddress,
			exchangeAddress,
			blockNumber - 80n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 43200n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 10: Whitelist Updated
	{
		const hash = `0x${'4'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: registryAddress,
					topics: encodeEventTopics({
						abi: Abis.tip403Registry,
						eventName: 'WhitelistUpdated',
						args: {
							policyId: 10n,
							updater: adminAddress,
							account: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'bool' }], [true]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, adminAddress, hash)
		const transaction = mockTransaction(
			hash,
			adminAddress,
			registryAddress,
			blockNumber - 90n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 86400n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 11: Role Membership Updated
	{
		const hash = `0x${'5'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'RoleMembershipUpdated',
						args: {
							role: Hex.padLeft('0x03', 32),
							account: accountAddress,
							sender: adminAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'bool' }], [true]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, adminAddress, hash)
		const transaction = mockTransaction(
			hash,
			adminAddress,
			tokenAddress,
			blockNumber - 100n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 172800n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 12: Token Created
	{
		const hash = `0x${'6'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: factoryAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20Factory,
						eventName: 'TokenCreated',
						args: {
							token: tokenAddress,
							tokenId: 1n,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[
							{ type: 'string' },
							{ type: 'string' },
							{ type: 'string' },
							{ type: 'address' },
							{ type: 'address' },
						],
						['Test Token 2', 'TEST2', 'USD', userTokenAddress, accountAddress],
					),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			factoryAddress,
			blockNumber - 110n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 259200n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 13: Pause State Update
	{
		const hash = `0x${'7'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'PauseStateUpdate',
						args: {
							updater: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'bool' }], [true]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			tokenAddress,
			blockNumber - 120n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 345600n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 14: Transfer Policy Update
	{
		const hash = `0x${'8'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'TransferPolicyUpdate',
						args: {
							updater: accountAddress,
							newPolicyId: 5n,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			tokenAddress,
			blockNumber - 130n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 432000n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 15: Supply Cap Update
	{
		const hash = `0x${'9'.repeat(63)}0` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'SupplyCapUpdate',
						args: {
							updater: accountAddress,
							newSupplyCap: 1000000000000000n,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			tokenAddress,
			blockNumber - 140n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 518400n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 16: Multi-event - Transfer + Approval + Role update
	{
		const hash = `0x${'ab'.repeat(32)}` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: accountAddress,
							to: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [250000n]),
				},
				hash,
			),
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Approval',
						args: {
							owner: accountAddress,
							spender: spenderAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [500000n]),
				},
				hash,
			),
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'RoleMembershipUpdated',
						args: {
							role: Hex.padLeft('0x01', 32),
							account: recipientAddress,
							sender: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'bool' }], [true]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			tokenAddress,
			blockNumber - 5n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 30n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 17: Multi-event - Mint + Transfer + Burn (complex token flow)
	{
		const hash = `0x${'cd'.repeat(32)}` as const
		const logs = [
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Mint',
						args: {
							to: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [1000000n]),
				},
				hash,
			),
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: accountAddress,
							to: recipientAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [300000n]),
				},
				hash,
			),
			mockLog(
				{
					address: tokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Burn',
						args: {
							from: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [200000n]),
				},
				hash,
			),
			mockLog(
				{
					address: userTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: recipientAddress,
							to: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [50000000n]),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, adminAddress, hash)
		const transaction = mockTransaction(
			hash,
			adminAddress,
			tokenAddress,
			blockNumber - 3n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 15n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	// Tx 18: Multi-event - Exchange order flow (5 events)
	{
		const hash = `0x${'ef'.repeat(32)}` as const
		const logs = [
			mockLog(
				{
					address: exchangeAddress,
					topics: encodeEventTopics({
						abi: Abis.stablecoinExchange,
						eventName: 'OrderPlaced',
						args: {
							orderId: 456n,
							maker: accountAddress,
							token: baseTokenAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'uint128' }, { type: 'bool' }, { type: 'int16' }],
						[5000000n, true, 101],
					),
				},
				hash,
			),
			mockLog(
				{
					address: exchangeAddress,
					topics: encodeEventTopics({
						abi: Abis.stablecoinExchange,
						eventName: 'OrderFilled',
						args: {
							orderId: 456n,
							maker: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'uint128' }, { type: 'bool' }],
						[2500000n, false],
					),
				},
				hash,
			),
			mockLog(
				{
					address: baseTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: accountAddress,
							to: makerAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [2500000n]),
				},
				hash,
			),
			mockLog(
				{
					address: quoteTokenAddress,
					topics: encodeEventTopics({
						abi: Abis.tip20,
						eventName: 'Transfer',
						args: {
							from: makerAddress,
							to: accountAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters([{ type: 'uint256' }], [2525000n]),
				},
				hash,
			),
			mockLog(
				{
					address: feeAmmAddress,
					topics: encodeEventTopics({
						abi: Abis.feeAmm,
						eventName: 'FeeSwap',
						args: {
							userToken: userTokenAddress,
							validatorToken: validatorTokenAddress,
						},
					}) as [Hex.Hex, ...Hex.Hex[]],
					data: encodeAbiParameters(
						[{ type: 'uint256' }, { type: 'uint256' }],
						[25000n, 24500n],
					),
				},
				hash,
			),
		]
		const receipt = mockReceipt(logs, accountAddress, hash)
		const transaction = mockTransaction(
			hash,
			accountAddress,
			exchangeAddress,
			blockNumber - 2n,
		)
		transactions.push({
			hash,
			transaction,
			receipt,
			block: { timestamp: baseTimestamp - 5n },
			knownEvents: parseKnownEvents(receipt, { transaction, getTokenMetadata }),
		})
	}

	return transactions
}

function loader() {
	if (import.meta.env.VITE_ENABLE_DEMO !== 'true') throw notFound()

	const transactions = createMockTransactions()
	const knownEvents: Record<Hex.Hex, KnownEvent[]> = {}
	for (const tx of transactions) {
		knownEvents[tx.hash] = tx.knownEvents
	}

	return {
		transactions,
		total: transactions.length,
		knownEvents,
	}
}

export const Route = createFileRoute('/_layout/demo/address')({
	component: Component,
	loader,
})

function Component() {
	const { transactions, total, knownEvents } = Route.useLoaderData()
	const isMobile = useMediaQuery('(max-width: 799px)')
	const mode = isMobile ? 'stacked' : 'tabs'
	const { copy, notifying } = useCopy()
	const [expandedTxs, setExpandedTxs] = React.useState<Set<Hex.Hex>>(new Set())

	const historyColumns: DataGrid.Column[] = [
		{ label: 'Time', align: 'start', minWidth: 100 },
		{ label: 'Description', align: 'start' },
		{ label: 'Hash', align: 'end' },
		{ label: 'Fee', align: 'end' },
		{ label: 'Total', align: 'end' },
	]

	return (
		<div
			className={cx(
				'max-[800px]:flex max-[800px]:flex-col max-w-[800px]:pt-10 max-w-[800px]:pb-8 w-full',
				'grid w-full pt-20 pb-16 px-4 gap-[14px] min-w-0 grid-cols-[auto_1fr] min-[1240px]:max-w-[1080px]',
			)}
		>
			<InfoCard
				title="Account"
				className="self-start"
				sections={[
					<button
						key="address"
						type="button"
						onClick={() => copy(accountAddress)}
						className="w-full text-left cursor-pointer press-down text-tertiary"
						title={accountAddress}
					>
						<div className="flex items-center gap-[8px] mb-[8px]">
							<span className="text-[13px] font-normal capitalize">
								Address
							</span>
							<div className="relative flex items-center">
								<CopyIcon className="w-[12px] h-[12px]" />
								{notifying && (
									<span className="absolute left-[calc(100%+8px)] text-[13px] leading-[16px]">
										copied
									</span>
								)}
							</div>
						</div>
						<p className="text-[14px] font-normal leading-[17px] tracking-[0.02em] text-primary break-all max-w-[22ch]">
							{accountAddress}
						</p>
					</button>,
					{
						label: 'Active',
						value: (
							<ClientOnly
								fallback={<span className="text-tertiary text-[13px]">…</span>}
							>
								<RelativeTime
									timestamp={baseTimestamp - 60n}
									className="text-[13px] text-primary"
								/>
							</ClientOnly>
						),
					},
					{
						label: 'Holdings',
						value: (
							<ClientOnly
								fallback={<span className="text-tertiary text-[13px]">…</span>}
							>
								<span className="text-[13px] text-primary">$1,234,567.00</span>
							</ClientOnly>
						),
					},
					{
						label: 'Created',
						value: (
							<ClientOnly
								fallback={<span className="text-tertiary text-[13px]">…</span>}
							>
								<RelativeTime
									timestamp={baseTimestamp - 518400n}
									className="text-[13px] text-primary"
								/>
							</ClientOnly>
						),
					},
				]}
			/>
			<Sections
				mode={mode}
				sections={[
					{
						title: 'History',
						totalItems: total,
						itemsLabel: 'transactions',
						content: (
							<DataGrid
								columns={{
									stacked: historyColumns,
									tabs: historyColumns,
								}}
								items={() =>
									transactions.map((tx) => {
										const events = knownEvents[tx.hash] ?? []
										const isExpanded = expandedTxs.has(tx.hash)
										const perspectiveEvents = events.map((event) =>
											getPerspectiveEvent(event, accountAddress),
										)

										const descriptionCell = isExpanded ? (
											perspectiveEvents.map((event, i) => {
												const key = `${event.type}-${i}`
												return (
													<EventDescription
														key={key}
														event={event}
														seenAs={accountAddress}
														className="flex flex-row items-center gap-[6px] leading-[18px] w-auto flex-wrap"
													/>
												)
											})
										) : (
											<div
												key="collapsed"
												className="text-primary h-[20px] flex items-center whitespace-nowrap"
											>
												{perspectiveEvents[0] && (
													<EventDescription
														event={perspectiveEvents[0]}
														seenAs={accountAddress}
														className="flex flex-row items-center gap-[6px] leading-[18px] w-auto justify-center flex-nowrap"
													/>
												)}
												{events.length > 1 && (
													<button
														type="button"
														onClick={(e) => {
															e.preventDefault()
															e.stopPropagation()
															setExpandedTxs((prev) =>
																new Set(prev).add(tx.hash),
															)
														}}
														className="ml-1 text-base-content-secondary cursor-pointer press-down shrink-0"
													>
														and {events.length - 1} more
													</button>
												)}
											</div>
										)

										return {
											cells: [
												<TransactionTimestamp
													key="time"
													timestamp={tx.block.timestamp}
													link={`/tx/${tx.hash}`}
												/>,
												descriptionCell,
												<TruncatedHash
													key="hash"
													hash={tx.hash}
													minChars={8}
												/>,
												<TransactionFee key="fee" receipt={tx.receipt} />,
												<TransactionTotal
													key="total"
													transaction={tx.transaction}
												/>,
											],
											link: {
												href: `/tx/${tx.hash}`,
												title: `View receipt ${tx.hash}`,
											},
											expanded: isExpanded,
										}
									})
								}
								totalItems={total}
								page={1}
								isPending={false}
								itemsLabel="transactions"
								itemsPerPage={total}
							/>
						),
					},
				]}
				activeSection={0}
				onSectionChange={() => {}}
			/>
		</div>
	)
}
