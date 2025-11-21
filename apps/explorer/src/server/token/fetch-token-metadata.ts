import { createServerFn } from '@tanstack/react-start'
import { Address } from 'ox'
import { Actions } from 'tempo.ts/wagmi'
import * as z from 'zod/mini'
import { config } from '#wagmi.config'

const FetchTokenMetadataInputSchema = z.object({
	address: z.pipe(
		z.string(),
		z.transform((value) => {
			const normalized = value.toLowerCase() as Address.Address
			Address.assert(normalized)
			return normalized
		}),
	),
})

export type FetchTokenMetadataInput = z.infer<
	typeof FetchTokenMetadataInputSchema
>

export const fetchTokenMetadata = createServerFn({ method: 'POST' })
	.inputValidator((input) => FetchTokenMetadataInputSchema.parse(input))
	.handler(async ({ data }) => {
		const metadata = await Actions.token.getMetadata(config, {
			token: data.address,
		})

		return metadata
	})
