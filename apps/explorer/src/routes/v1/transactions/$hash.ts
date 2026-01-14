import { createFileRoute } from '@tanstack/react-router'
import { Address } from 'ox'
import { getBlock, getTransaction, getTransactionReceipt } from 'wagmi/actions'
import type { TransactionInfo } from '../_types'
import {
	badRequest,
	corsPreflightResponse,
	jsonResponse,
	notFound,
	serverError,
} from '../_utils'
import { zHash } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

export const Route = createFileRoute('/v1/transactions/$hash')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async ({ params }) => {
				try {
					const parseResult = zHash().safeParse(params.hash)
					if (!parseResult.success) {
						return badRequest('Invalid transaction hash format')
					}
					const hash = parseResult.data

					const config = getWagmiConfig()

					let receipt
					try {
						receipt = await getTransactionReceipt(config, { hash })
					} catch {
						return notFound('Transaction not found')
					}

					const [block, transaction] = await Promise.all([
						getBlock(config, { blockHash: receipt.blockHash }),
						getTransaction(config, { hash: receipt.transactionHash }),
					])

					const info: TransactionInfo = {
						hash: receipt.transactionHash,
						blockNumber: receipt.blockNumber.toString(),
						blockHash: receipt.blockHash,
						from: Address.checksum(receipt.from),
						to: receipt.to ? Address.checksum(receipt.to) : null,
						value: transaction.value.toString(),
						input: transaction.input,
						nonce: transaction.nonce.toString(),
						gas: transaction.gas.toString(),
						gasPrice: (transaction.gasPrice ?? 0n).toString(),
						gasUsed: receipt.gasUsed.toString(),
						status: receipt.status === 'success' ? 'success' : 'reverted',
						timestamp: Number(block.timestamp),
					}

					return jsonResponse(info)
				} catch (error) {
					console.error('Transaction info error:', error)
					return serverError('Failed to fetch transaction info')
				}
			},
		},
	},
})
