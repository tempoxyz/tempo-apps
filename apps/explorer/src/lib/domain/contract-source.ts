import { getApiUrl, clientEnv } from '#lib/env.ts'
import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import { isAddress } from 'viem'
import { useChainId } from 'wagmi'
import * as z from 'zod/mini'

const CONTRACT_SOURCE_FIELDS = [
	'stdJsonInput',
	'abi',
	'compilation',
	'sources',
	'name',
	'extensions.tempo.nativeSource',
].join(',')

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

const NullableStringSchema = z.union([z.string(), z.null()])

const SourceFileSchema = z.object({
	content: z.string(),
	highlightedHtml: z.optional(z.string()),
})

const SourceFilesSchema = z.record(z.string(), SourceFileSchema)

const VerifiedStdJsonInputSchema = z.object({
	language: z.string(),
	sources: SourceFilesSchema,
	settings: SoliditySettingsSchema,
})

const CompilationSchema = z.object({
	compiler: z.string(),
	compilerVersion: z.string(),
	language: z.string(),
	name: z.string(),
	fullyQualifiedName: z.string(),
	compilerSettings: SoliditySettingsSchema,
})

const NativeSourceMetadataSchema = z.object({
	kind: z.string(),
	language: z.string(),
	bytecodeVerified: z.boolean(),
	repository: z.string(),
	commit: z.string(),
	commitUrl: z.optional(NullableStringSchema),
	paths: z.array(z.string()),
	entrypoints: z.array(z.string()),
	activation: z.object({
		protocolVersion: NullableStringSchema,
		fromBlock: NullableStringSchema,
		toBlock: NullableStringSchema,
	}),
})

const RawContractVerificationLookupSchema = z.object({
	matchId: NullableStringSchema,
	match: NullableStringSchema,
	creationMatch: NullableStringSchema,
	runtimeMatch: NullableStringSchema,
	chainId: z.coerce.number(),
	address: z.string(),
	verifiedAt: NullableStringSchema,
	name: z.optional(NullableStringSchema),
	stdJsonInput: z.optional(z.union([VerifiedStdJsonInputSchema, z.null()])),
	abi: z.array(z.any()),
	compilation: z.optional(z.union([CompilationSchema, z.null()])),
	sources: z.optional(SourceFilesSchema),
	extensions: z.optional(
		z.object({
			tempo: z.optional(
				z.object({
					nativeSource: z.optional(NativeSourceMetadataSchema),
				}),
			),
		}),
	),
})

const VerifiedContractSourceSchema = z.object({
	kind: z.literal('verified'),
	chainId: z.coerce.number(),
	address: z.string(),
	match: NullableStringSchema,
	runtimeMatch: NullableStringSchema,
	verifiedAt: NullableStringSchema,
	stdJsonInput: VerifiedStdJsonInputSchema,
	abi: z.array(z.any()),
	compilation: CompilationSchema,
})

const NativeContractSourceSchema = z.object({
	kind: z.literal('native'),
	chainId: z.coerce.number(),
	address: z.string(),
	match: NullableStringSchema,
	runtimeMatch: NullableStringSchema,
	verifiedAt: NullableStringSchema,
	name: z.string(),
	abi: z.array(z.any()),
	sources: SourceFilesSchema,
	nativeSource: NativeSourceMetadataSchema,
})

export const ContractSourceSchema = z.union([
	VerifiedContractSourceSchema,
	NativeContractSourceSchema,
])

export type ContractSource = z.infer<typeof ContractSourceSchema>
export type ContractSourceFile = z.infer<typeof SourceFileSchema>

export function normalizeContractSourceResponse(
	data: z.infer<typeof RawContractVerificationLookupSchema>,
): ContractSource {
	if (data.stdJsonInput && data.compilation) {
		return {
			kind: 'verified',
			chainId: data.chainId,
			address: data.address,
			match: data.match,
			runtimeMatch: data.runtimeMatch,
			verifiedAt: data.verifiedAt,
			stdJsonInput: data.stdJsonInput,
			abi: data.abi,
			compilation: data.compilation,
		}
	}

	const nativeSource = data.extensions?.tempo?.nativeSource
	if (data.name && data.sources && nativeSource) {
		return {
			kind: 'native',
			chainId: data.chainId,
			address: data.address,
			match: data.match,
			runtimeMatch: data.runtimeMatch,
			verifiedAt: data.verifiedAt,
			name: data.name,
			abi: data.abi,
			sources: data.sources,
			nativeSource,
		}
	}

	throw new Error('Unsupported contract source response shape')
}

export function parseRawContractSourceResponse(value: unknown): ContractSource {
	const { data, success, error } = z.safeParse(
		RawContractVerificationLookupSchema,
		value,
	)
	if (!success) {
		throw new Error(z.prettifyError(error))
	}

	return normalizeContractSourceResponse(data)
}

export function parseContractSource(value: unknown): ContractSource {
	const { data, success, error } = z.safeParse(ContractSourceSchema, value)
	if (!success) {
		throw new Error(z.prettifyError(error))
	}

	return data
}

/**
 * Fetch contract sources directly from the upstream API.
 * Use this for SSR where __BASE_URL__ may not be reachable.
 */
export async function fetchContractSourceDirect(params: {
	address: Address.Address
	chainId: number
	signal?: AbortSignal
}): Promise<ContractSource> {
	const { address, chainId, signal } = params

	const apiUrl = new URL(
		`${clientEnv.CONTRACT_VERIFICATION_API_BASE_URL}/v2/contract/${chainId}/${address.toLowerCase()}`,
	)
	apiUrl.searchParams.set('fields', CONTRACT_SOURCE_FIELDS)

	const response = await fetch(apiUrl.toString(), { signal })

	if (!response.ok) {
		throw new Error('Failed to fetch contract sources')
	}

	return parseRawContractSourceResponse(await response.json())
}

/**
 * Fetch contract sources from the local API proxy.
 * This provides syntax highlighting via the /api/code endpoint.
 */
export async function fetchContractSource(params: {
	address: Address.Address
	chainId: number
	highlight?: boolean
	signal?: AbortSignal
}): Promise<ContractSource | null> {
	const { address, chainId, highlight = true, signal } = params

	try {
		const url = getApiUrl(
			'/api/code',
			new URLSearchParams({
				address: address.toLowerCase(),
				chainId: chainId.toString(),
				highlight: highlight ? 'true' : 'false',
			}),
		)

		const response = await fetch(url, { signal })

		if (response.status === 404) return null

		if (!response.ok) {
			console.error('Failed to fetch contract sources:', await response.text())
			throw new Error('Failed to fetch contract sources')
		}

		return parseContractSource(await response.json())
	} catch (error) {
		console.error('Failed to fetch contract sources:', error)
		throw new Error(error instanceof Error ? error.message : 'Unknown error')
	}
}

export function contractSourceQueryOptions(params: {
	address: Address.Address
	chainId: number
}) {
	const { address, chainId } = params
	return queryOptions({
		enabled: isAddress(address) && Boolean(chainId),
		queryKey: ['contract-source', address, chainId],
		queryFn: () => fetchContractSource({ address, chainId }),
		// staleTime: 0 so client refetches with highlighting after SSR seeds unhighlighted data
		// gcTime keeps the data cached to prevent flashing during refetch
		staleTime: 0,
		gcTime: 1000 * 60 * 60, // 1 hour
	})
}

export function useContractSourceQueryOptions(params: {
	address: Address.Address
	chainId?: number
}) {
	const { address, chainId } = params
	const defaultChainId = useChainId()

	return contractSourceQueryOptions({
		address,
		chainId: chainId ?? defaultChainId,
	})
}
