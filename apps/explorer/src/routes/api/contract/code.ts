import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as z from 'zod/mini'
import { zAddress } from '#lib/zod.ts'

const CONTRACT_VERIFICATION_API_BASE_URL = import.meta.env
	.VITE_CONTRACT_VERIFY_URL
	? `${import.meta.env.VITE_CONTRACT_VERIFY_URL}/v2/contract`
	: 'https://sourcify.dev/server/v2/contract'

const ContractVerificationLookupSchema = z.object({
	matchId: z.number(),
	match: z.string(),
	creationMatch: z.string(),
	runtimeMatch: z.string(),
	chainId: z.number(),
	address: z.string(),
	verifiedAt: z.string(),
	stdJsonInput: z.object({
		language: z.string(),
		sources: z.record(
			z.string(),
			z.object({
				content: z.string(),
			}),
		),
		settings: z.object({
			remappings: z.array(z.string()),
			optimizer: z.object({
				enabled: z.boolean(),
				runs: z.number(),
			}),
			metadata: z.object({
				useLiteralContent: z.boolean(),
				bytecodeHash: z.string(),
				appendCBOR: z.boolean(),
			}),
			outputSelection: z.record(
				z.string(),
				z.record(z.string(), z.array(z.string())),
			),
			evmVersion: z.string(),
			viaIR: z.boolean(),
			libraries: z.record(z.string(), z.string()),
		}),
	}),
	abi: z.array(
		z.object({
			inputs: z.array(
				z.object({
					internalType: z.string(),
					name: z.string(),
					type: z.string(),
				}),
			),
			name: z.string(),
			outputs: z.array(
				z.object({
					internalType: z.string(),
					name: z.string(),
					type: z.string(),
				}),
			),
		}),
	),
})

export const Route = createFileRoute('/api/contract/code')({
	server: {
		handlers: {
			GET: async (context) => {
				const url = new URL(context.request.url)
				const {
					data: parsedSearchParams,
					error: parsedSearchParamsError,
					success: parsedSearchParamsSuccess,
				} = z.safeParse(
					z.object({
						address: zAddress({ lowercase: true }),
						chainId: z.positive(),
					}),
					Object.fromEntries(url.searchParams),
				)

				if (!parsedSearchParamsSuccess)
					return json(
						{ error: z.prettifyError(parsedSearchParamsError) },
						{ status: 400 },
					)

				const baseUrl = new URL(
					`${CONTRACT_VERIFICATION_API_BASE_URL}/${parsedSearchParams.chainId}/${parsedSearchParams.address.toLowerCase()}`,
				)
				baseUrl.searchParams.set('fields', 'stdJsonInput,abi')
				const response = await fetch(baseUrl.toString())

				if (!response.ok)
					return json(
						{ error: 'Failed to fetch contract code' },
						{ status: 500 },
					)
				const { data, success, error } = z.safeParse(
					ContractVerificationLookupSchema,
					await response.json(),
				)
				if (!success)
					return json({ error: z.prettifyError(error) }, { status: 500 })

				return json(data)
			},
		},
	},
})
