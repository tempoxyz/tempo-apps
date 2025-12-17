import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as z from 'zod/mini'
import { zAddress } from '#lib/zod.ts'

const CONTRACT_VERIFICATION_API_BASE_URL =
	'https://contracts.tempo.xyz/v2/contract'

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
		sources: z.record(z.string(), z.object({ content: z.string() })),
		settings: z.object({
			remappings: z.array(z.string()),
			optimizer: z.object({ enabled: z.boolean(), runs: z.number() }),
			metadata: z.object({
				useLiteralContent: z.boolean(),
				bytecodeHash: z.string(),
				appendCBOR: z.boolean(),
			}),
			outputSelection: z.record(
				z.string(),
				z.record(z.string(), z.array(z.string())),
			),
			viaIR: z.boolean(),
			evmVersion: z.string(),
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
	compilation: z.object({
		compiler: z.string(),
		version: z.string(),
		language: z.string(),
		name: z.string(),
		fullyQualifiedName: z.string(),
		compilerSettings: z.object({
			remappings: z.array(z.string()),
			optimizer: z.object({ enabled: z.boolean(), runs: z.number() }),
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
})

export const Route = createFileRoute('/api/code')({
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
						chainId: z.coerce.number(),
					}),
					Object.fromEntries(url.searchParams),
				)

				if (!parsedSearchParamsSuccess)
					return json(
						{ error: z.prettifyError(parsedSearchParamsError) },
						{ status: 400 },
					)

				const apiUrl = new URL(
					`${CONTRACT_VERIFICATION_API_BASE_URL}/${parsedSearchParams.chainId}/${parsedSearchParams.address.toLowerCase()}`,
				)
				apiUrl.searchParams.set('fields', 'stdJsonInput,abi,compilation')
				const response = await fetch(apiUrl.toString())

				if (!response.ok)
					return json(
						{ error: 'Failed to fetch contract code' },
						{ status: response.status },
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
