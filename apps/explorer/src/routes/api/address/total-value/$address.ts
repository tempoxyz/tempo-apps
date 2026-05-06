import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import { formatUnits } from 'viem'
import { Abis } from 'viem/tempo'
import { getChainId, readContracts } from 'wagmi/actions'
import { hasIndexSupply } from '#lib/env'
import { getTokenListAddresses } from '#lib/server/tokens'
import { fetchAddressTransfersForValue } from '#lib/server/tempo-queries'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

export const Route = createFileRoute('/api/address/total-value/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!hasIndexSupply()) return Response.json({ totalValue: 0 })

				try {
					const address = zAddress().parse(params.address)
					const chainId = getChainId(getWagmiConfig())
					const addressLower = address.toLowerCase()

					// Limit to prevent timeouts on addresses with many transfer events
					const MAX_TRANSFERS = 10000

					const result = await fetchAddressTransfersForValue(
						address,
						chainId,
						MAX_TRANSFERS,
					)

					// Calculate balance per token
					const balances = new Map<Address.Address, bigint>()
					for (const row of result) {
						const tokenAddress = Address.from(String(row.address).toLowerCase())
						const from = String(row.from).toLowerCase()
						const to = String(row.to).toLowerCase()
						const tokens = BigInt(row.tokens)

						const currentBalance = balances.get(tokenAddress) ?? 0n
						let newBalance = currentBalance
						if (to === addressLower) {
							newBalance += tokens
						}
						if (from === addressLower) {
							newBalance -= tokens
						}
						balances.set(tokenAddress, newBalance)
					}

					// Filter for positive balances
					const rowsWithBalance = [...balances.entries()]
						.filter(([_, balance]) => balance > 0n)
						.map(([tokenAddress, balance]) => ({ tokenAddress, balance }))

					const listedTokenAddresses = await getTokenListAddresses(chainId)
					const listedRowsWithBalance = rowsWithBalance.filter((row) =>
						listedTokenAddresses.has(row.tokenAddress.toLowerCase()),
					)

					// Limit contract reads to prevent slow responses (cap at 20 tokens)
					const MAX_TOKENS = 20
					const tokensToFetch = listedRowsWithBalance.slice(0, MAX_TOKENS)

					const config = getWagmiConfig()
					const createMetadataContract = (
						tokenAddress: Address.Address,
						functionName: 'decimals' | 'currency',
					) => ({
						address: tokenAddress,
						abi: Abis.tip20,
						functionName,
					})
					const metadataContracts = tokensToFetch.flatMap((row) => [
						createMetadataContract(row.tokenAddress, 'decimals'),
						createMetadataContract(row.tokenAddress, 'currency'),
					])
					const contractResults = await readContracts(config, {
						allowFailure: true,
						contracts: metadataContracts,
					})

					const metadataByToken = new Map<
						Address.Address,
						{ currency: string; decimals: number }
					>()
					for (const [index, row] of tokensToFetch.entries()) {
						const decimalsCall = contractResults[index * 2]
						const currencyCall = contractResults[index * 2 + 1]
						if (
							decimalsCall?.status !== 'success' ||
							currencyCall?.status !== 'success'
						) {
							continue
						}

						const decimalsResult = decimalsCall.result
						const currencyResult = currencyCall.result

						if (
							typeof decimalsResult !== 'number' ||
							typeof currencyResult !== 'string'
						) {
							continue
						}

						metadataByToken.set(row.tokenAddress, {
							currency: currencyResult,
							decimals: decimalsResult,
						})
					}

					const totalValue = tokensToFetch
						.map((row) => {
							const metadata = metadataByToken.get(row.tokenAddress)
							if (metadata?.currency !== 'USD') {
								return 0
							}

							return Number(formatUnits(row.balance, metadata.decimals))
						})
						.reduce((acc, balance) => acc + balance, 0)

					return Response.json({ totalValue })
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					return Response.json(
						{ data: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
