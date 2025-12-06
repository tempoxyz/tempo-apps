import { createFileRoute, notFound } from '@tanstack/react-router'
import { Hex } from 'ox'
import { Abis } from 'tempo.ts/viem'
import { encodeAbiParameters, encodeEventTopics, zeroAddress } from 'viem'
import { Receipt } from '#components/transaction/receipt/Receipt'
import {
	accountAddress,
	adminAddress,
	baseTokenAddress,
	blockNumber,
	exchangeAddress,
	factoryAddress,
	feeAmmAddress,
	getTokenMetadata,
	makerAddress,
	mockLog,
	mockReceipt,
	quoteTokenAddress,
	recipientAddress,
	registryAddress,
	spenderAddress,
	tokenAddress,
	transactionHash,
	updaterAddress,
	userTokenAddress,
	validatorAddress,
	validatorTokenAddress,
} from '#lib/demo'
import { parseKnownEvents } from '#lib/domain/known-events'

function loader() {
	if (import.meta.env.VITE_ENABLE_DEMO !== 'true') throw notFound()

	const receipt = mockReceipt(
		[
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
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
					abi: Abis.tip403Registry,
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
					abi: Abis.tip20,
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
					abi: Abis.tip20,
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
			mockLog({
				address: zeroAddress,
				topics: encodeEventTopics({
					abi: Abis.nonce,
					eventName: 'NonceIncremented',
					args: {
						account: accountAddress,
						nonceKey: 42n,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint64' }], [7n]),
			}),
			mockLog({
				address: zeroAddress,
				topics: encodeEventTopics({
					abi: Abis.nonce,
					eventName: 'ActiveKeyCountChanged',
					args: {
						account: accountAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [3n]),
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'Approval',
					args: {
						owner: updaterAddress,
						spender: spenderAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [1000000n]),
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'BurnBlocked',
					args: {
						from: accountAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [50000n]),
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'TransferPolicyUpdate',
					args: {
						updater: updaterAddress,
						newPolicyId: 5n,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'NextQuoteTokenSet',
					args: {
						updater: updaterAddress,
						nextQuoteToken: userTokenAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'QuoteTokenUpdate',
					args: {
						updater: updaterAddress,
						newQuoteToken: userTokenAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'RewardCanceled',
					args: {
						funder: updaterAddress,
						id: 99n,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [2500000n]),
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'RewardRecipientSet',
					args: {
						holder: updaterAddress,
						recipient: recipientAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'RoleAdminUpdated',
					args: {
						role: Hex.padLeft('0x01', 32),
						newAdminRole: Hex.padLeft('0x02', 32),
						sender: adminAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: feeAmmAddress,
				topics: encodeEventTopics({
					abi: Abis.feeAmm,
					eventName: 'Mint',
					args: {
						sender: updaterAddress,
						userToken: userTokenAddress,
						validatorToken: validatorTokenAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters(
					[{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
					[1000000000n, 500000000n, 707106781n],
				),
			}),
			mockLog({
				address: feeAmmAddress,
				topics: encodeEventTopics({
					abi: Abis.feeAmm,
					eventName: 'Burn',
					args: {
						sender: updaterAddress,
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
			}),
			mockLog({
				address: feeAmmAddress,
				topics: encodeEventTopics({
					abi: Abis.feeAmm,
					eventName: 'RebalanceSwap',
					args: {
						userToken: userTokenAddress,
						validatorToken: validatorTokenAddress,
						swapper: updaterAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters(
					[{ type: 'uint256' }, { type: 'uint256' }],
					[100000000n, 95000000n],
				),
			}),
			mockLog({
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
					[50000000n, 48500000n],
				),
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'Transfer',
					args: {
						from: updaterAddress,
						to: recipientAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [250000n]),
			}),
			// Test case: Mint without memo (just Mint event)
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'Mint',
					args: {
						to: recipientAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [500000n]),
			}),
			// Test case: Burn without memo (just Burn event)
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'Burn',
					args: {
						from: updaterAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [100000n]),
			}),
			// Test case: Mint WITH memo (Mint + TransferWithMemo pair - should dedupe to just Mint with memo)
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'Mint',
					args: {
						to: accountAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [200000n]),
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'TransferWithMemo',
					args: {
						from: zeroAddress,
						to: accountAddress,
						memo: Hex.padLeft(Hex.fromString('Minted for you!'), 32),
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [200000n]),
			}),
			// Test case: Burn WITH memo (Burn + TransferWithMemo pair - should dedupe to just Burn with memo)
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'Burn',
					args: {
						from: adminAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [75000n]),
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'TransferWithMemo',
					args: {
						from: adminAddress,
						to: zeroAddress,
						memo: Hex.padLeft(Hex.fromString('Burned by admin'), 32),
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint256' }], [75000n]),
			}),
			mockLog({
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
			}),
			mockLog({
				address: tokenAddress,
				topics: encodeEventTopics({
					abi: Abis.tip20,
					eventName: 'PauseStateUpdate',
					args: {
						updater: adminAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'bool' }], [true]),
			}),
			mockLog({
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
					['Test Token 2', 'TEST2', 'USD', userTokenAddress, adminAddress],
				),
			}),
			mockLog({
				address: exchangeAddress,
				topics: encodeEventTopics({
					abi: Abis.stablecoinExchange,
					eventName: 'PairCreated',
					args: {
						key: Hex.padLeft('0xabc', 32),
						base: baseTokenAddress,
						quote: quoteTokenAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: exchangeAddress,
				topics: encodeEventTopics({
					abi: Abis.stablecoinExchange,
					eventName: 'OrderPlaced',
					args: {
						orderId: 123n,
						maker: makerAddress,
						token: baseTokenAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters(
					[{ type: 'uint128' }, { type: 'bool' }, { type: 'int16' }],
					[1000000n, true, 100],
				),
			}),
			mockLog({
				address: exchangeAddress,
				topics: encodeEventTopics({
					abi: Abis.stablecoinExchange,
					eventName: 'FlipOrderPlaced',
					args: {
						orderId: 124n,
						maker: makerAddress,
						token: baseTokenAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters(
					[
						{ type: 'uint128' },
						{ type: 'bool' },
						{ type: 'int16' },
						{ type: 'int16' },
					],
					[2000000n, false, 105, 95],
				),
			}),
			mockLog({
				address: exchangeAddress,
				topics: encodeEventTopics({
					abi: Abis.stablecoinExchange,
					eventName: 'OrderFilled',
					args: {
						orderId: 123n,
						maker: makerAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters(
					[{ type: 'uint128' }, { type: 'bool' }],
					[500000n, false],
				),
			}),
			mockLog({
				address: exchangeAddress,
				topics: encodeEventTopics({
					abi: Abis.stablecoinExchange,
					eventName: 'OrderCancelled',
					args: {
						orderId: 124n,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
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
			}),
			mockLog({
				address: registryAddress,
				topics: encodeEventTopics({
					abi: Abis.tip403Registry,
					eventName: 'BlacklistUpdated',
					args: {
						policyId: 10n,
						updater: adminAddress,
						account: spenderAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'bool' }], [true]),
			}),
			mockLog({
				address: registryAddress,
				topics: encodeEventTopics({
					abi: Abis.tip403Registry,
					eventName: 'PolicyCreated',
					args: {
						policyId: 15n,
						updater: adminAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
				data: encodeAbiParameters([{ type: 'uint8' }], [1]),
			}),
			mockLog({
				address: zeroAddress,
				topics: encodeEventTopics({
					abi: Abis.feeManager,
					eventName: 'UserTokenSet',
					args: {
						user: updaterAddress,
						token: userTokenAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
			mockLog({
				address: zeroAddress,
				topics: encodeEventTopics({
					abi: Abis.feeManager,
					eventName: 'ValidatorTokenSet',
					args: {
						validator: validatorAddress,
						token: validatorTokenAddress,
					},
				}) as [Hex.Hex, ...Hex.Hex[]],
			}),
		],
		updaterAddress,
	)

	const knownEvents = parseKnownEvents(receipt, { getTokenMetadata })

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
		rawData: JSON.stringify({ demo: true }, null, 2),
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
