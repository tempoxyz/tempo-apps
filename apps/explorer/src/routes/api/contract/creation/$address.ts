import { createFileRoute } from '@tanstack/react-router'
import * as Address from 'ox/Address'
import {
	fetchContractCreationData,
	serializeContractCreation,
} from '#lib/server/contract-creation'
import { zAddress } from '#lib/zod'

export const Route = createFileRoute('/api/contract/creation/$address')({
	server: {
		handlers: {
			GET: async ({ params }: { params: { address: string } }) => {
				try {
					const address = zAddress().parse(params.address)
					Address.assert(address)

					const creation = await fetchContractCreationData(address)

					return Response.json({
						creation: creation ? serializeContractCreation(creation) : null,
						error: null,
					})
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : error
					console.error('[contract/creation] Error:', errorMessage)
					return Response.json(
						{ creation: null, error: errorMessage },
						{ status: 500 },
					)
				}
			},
		},
	},
})
