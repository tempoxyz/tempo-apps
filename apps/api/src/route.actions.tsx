import { Hono } from 'hono'
import * as z from 'zod/mini'
import { timeout } from 'hono/timeout'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { Actions as TempoActions } from 'wagmi/tempo'
import { waitForTransactionReceipt } from 'wagmi/actions'

import { wagmiConfig, zAddress, zChainId } from '#wagmi.config.ts'

const actionsApp = new Hono<{ Bindings: Cloudflare.Env }>()

actionsApp.use(
	'*',
	timeout(
		100_000,
		(context) =>
			new HTTPException(408, {
				message: `Timedout after ${context.req.raw.headers.get('Duration')} seconds`,
			}),
	),
)

actionsApp.on(
	['GET', 'POST'],
	'/faucet',
	zValidator(
		'query',
		z.object({
			chainId: zChainId(),
			address: zAddress({ lowercase: true }),
		}),
		(result, context) => {
			if (!result.success)
				return context.json(
					{ data: null, error: z.prettifyError(result.error) },
					400,
				)
		},
	),
	async (context) => {
		const { address: account, chainId } = context.req.valid('query')

		try {
			const hashes = await TempoActions.faucet.fund(wagmiConfig, {
				account,
				chainId,
			})

			const receiptsPromises = await Promise.allSettled(
				hashes.map((hash) =>
					waitForTransactionReceipt(wagmiConfig, {
						hash,
						chainId,
						timeout: 60_000,
					}),
				),
			)

			const receipts = receiptsPromises.map((result) => {
				if (result.status === 'fulfilled') return result.value
				throw result.reason
			})

			const data = receipts.map((receipt) => ({
				to: receipt.to,
				from: receipt.from,
				hash: receipt.transactionHash,
				gasUsed: receipt.gasUsed.toString(),
				blockNumber: receipt.blockNumber.toString(),
			}))

			return context.json({ data, error: null })
		} catch (error) {
			console.error(error)
			const errorMessage = error instanceof Error ? error.message : error
			return context.json({ data: null, error: errorMessage }, 500)
		}
	},
)

export { actionsApp }
