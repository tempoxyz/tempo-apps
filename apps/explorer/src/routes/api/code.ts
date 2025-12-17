import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as z from 'zod/mini'
import { ContractVerificationLookupSchema } from '#lib/domain/contract-source.ts'
import { zAddress } from '#lib/zod.ts'

const CONTRACT_VERIFICATION_API_BASE_URL =
	'https://contracts.tempo.xyz/v2/contract'

export const Route = createFileRoute('/api/code')({
	server: {
		handlers: {
			GET: async (context) => {
				const url = new URL(context.request.url)

				const normalizedParams = Object.fromEntries(
					Array.from(url.searchParams.entries()).map(([k, v]) => [
						k.toLowerCase(),
						v,
					]),
				)
				const {
					data: parsedSearchParams,
					error: parsedSearchParamsError,
					success: parsedSearchParamsSuccess,
				} = z.safeParse(
					z.object({
						address: zAddress({ lowercase: true }),
						chainid: z.coerce.number(),
					}),
					normalizedParams,
				)

				if (!parsedSearchParamsSuccess)
					return json(
						{ error: z.prettifyError(parsedSearchParamsError) },
						{ status: 400 },
					)

				const apiUrl = new URL(
					`${CONTRACT_VERIFICATION_API_BASE_URL}/${parsedSearchParams.chainid}/${parsedSearchParams.address.toLowerCase()}`,
				)
				apiUrl.searchParams.set('fields', 'stdJsonInput,abi,compilation')
				const response = await fetch(apiUrl.toString())

				if (!response.ok)
					return json(
						{ error: 'Failed to fetch contract code' },
						{ status: response.status },
					)

				const responseData = await response.json()

				const { data, success, error } = z.safeParse(
					ContractVerificationLookupSchema,
					responseData,
				)
				if (!success)
					return json({ error: z.prettifyError(error) }, { status: 500 })

				return json(data)
			},
		},
	},
})
