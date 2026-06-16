import { createFileRoute } from '@tanstack/react-router'
import {
	type AddressMetadataResponse,
	fetchAddressMetadataData,
} from '#lib/server/address-metadata'
import { zAddress } from '#lib/zod'

export type { AddressMetadataResponse } from '#lib/server/address-metadata'

export const Route = createFileRoute('/api/address/metadata/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const fallback: AddressMetadataResponse = {
					address: params.address,
					chainId: 0,
					accountType: 'empty',
				}

				try {
					const address = zAddress({ lowercase: true }).parse(params.address)
					const response = await fetchAddressMetadataData(address)

					return Response.json(response, {
						headers: {
							'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
						},
					})
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					return Response.json(
						{ ...fallback, error: String(errorMessage) },
						{ status: 500 },
					)
				}
			},
		},
	},
})
