import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import { isAddress } from 'viem'
import { getChainId } from 'wagmi/actions'
import * as z from 'zod/mini'

import { config } from '#wagmi.config.ts'

const SoliditySettingsSchema = z.object({
	remappings: z.optional(z.array(z.string())),
	optimizer: z.optional(
		z.object({
			enabled: z.boolean(),
			runs: z.number(),
		}),
	),
	metadata: z.optional(
		z.object({
			useLiteralContent: z.optional(z.boolean()),
			bytecodeHash: z.optional(z.string()),
			appendCBOR: z.optional(z.boolean()),
		}),
	),
	outputSelection: z.optional(
		z.record(z.string(), z.record(z.string(), z.array(z.string()))),
	),
	evmVersion: z.optional(z.string()),
	viaIR: z.optional(z.boolean()),
	libraries: z.optional(z.record(z.string(), z.string())),
})

export const ContractVerificationLookupSchema = z.object({
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
		settings: SoliditySettingsSchema,
	}),
	abi: z.array(z.any()),
	compilation: z.object({
		compiler: z.string(),
		version: z.string(),
		language: z.string(),
		name: z.string(),
		fullyQualifiedName: z.string(),
		compilerSettings: SoliditySettingsSchema,
	}),
})

export type ContractSource = z.infer<typeof ContractVerificationLookupSchema>

/**
 * Fetch verified contract sources from Sauce registry.
 * Returns undefined when the contract is not verified or a network error occurs.
 */
export async function fetchContractSource(params: {
	address: Address.Address
	chainId: number
	signal?: AbortSignal
}): Promise<ContractSource> {
	const { address, chainId, signal } = params

	try {
		const url = `${__BASE_URL__}/api/code?address=${address.toLowerCase()}&chainId=${chainId}`

		const response = await fetch(url, { signal })

		if (!response.ok) {
			console.error(' Failed to fetch contract sources:', await response.text())
			throw new Error('Failed to fetch contract sources')
		}

		const { data, success, error } = z.safeParse(
			ContractVerificationLookupSchema,
			await response.json(),
		)
		if (!success) {
			console.error('Failed to parse contract sources:', z.prettifyError(error))
			throw new Error(z.prettifyError(error))
		}

		if (!data) throw new Error('Failed to parse contract sources')

		return data
	} catch (error) {
		console.error('Failed to fetch contract sources:', error)
		throw new Error(error instanceof Error ? error.message : 'Unknown error')
	}
}

export function useContractSourceQueryOptions(params: {
	address: Address.Address
	chainId?: number
}) {
	const { address, chainId = getChainId(config) } = params
	return queryOptions({
		enabled: isAddress(address) && Boolean(chainId),
		queryKey: ['contract-source', address, chainId],
		queryFn: () => fetchContractSource({ address, chainId }),
	})
}
