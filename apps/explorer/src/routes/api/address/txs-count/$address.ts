import { createFileRoute } from '@tanstack/react-router'
import * as IDX from 'idxs'
import { Address } from 'ox'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'
import { isTestnet } from '#lib/env'
import { zAddress } from '#lib/zod'
import { getWagmiConfig } from '#wagmi.config'

const IS = IDX.IndexSupply.create({
	apiKey: process.env.INDEXER_API_KEY,
})

const QB = IDX.QueryBuilder.from(IS)

const chainId = getChainId(getWagmiConfig())

const RequestSchema = z.object({
	chainId: z.prefault(z.coerce.number(), chainId),
})

export const Route = createFileRoute('/api/address/txs-count/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (isTestnet()) return Response.json({ data: 0, error: null })

				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const parseResult = RequestSchema.safeParse(params)
					if (!parseResult.success)
						return Response.json(
							{ error: z.prettifyError(parseResult.error), data: null },
							{ status: 400 },
						)

					const { chainId } = parseResult.data

					const [txSentResult, txReceivedResult] = await Promise.all([
						QB.selectFrom('txs')
							.select((eb) => eb.fn.count('hash').as('cnt'))
							.where('from', '=', address)
							.where('chain', '=', chainId)
							.executeTakeFirst(),
						QB.selectFrom('txs')
							.select((eb) => eb.fn.count('hash').as('cnt'))
							.where('to', '=', address)
							.where('chain', '=', chainId)
							.executeTakeFirst(),
					])

					const txSent = txSentResult?.cnt ?? 0
					const txReceived = txReceivedResult?.cnt ?? 0

					return Response.json({
						data: Number(txSent) + Number(txReceived),
						error: null,
					})
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
