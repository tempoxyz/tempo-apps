import { createFileRoute } from '@tanstack/react-router'
import {
	type AddressMetadata,
	getAddressMetadata,
} from '#lib/server/address-metadata'
import { zAddress } from '#lib/zod'

export type AddressMetadataResponse = AddressMetadata & { error?: string }

export const Route = createFileRoute('/api/address/metadata/$address')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					const address = zAddress({ lowercase: true }).parse(params.address)
					const response = await getAddressMetadata(address)

					return Response.json(response, {
						headers: {
							'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
						},
					})
				} catch (error) {
					console.error(error)
					const errorMessage = error instanceof Error ? error.message : error
					const fallback: AddressMetadataResponse = {
						address: params.address,
						chainId: 0,
						accountType: 'empty',
						error: String(errorMessage),
					}
					return Response.json(fallback, { status: 500 })
				}
			},
		},
	},
})
