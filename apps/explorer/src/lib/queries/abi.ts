import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { autoloadAbi, lookupSignature } from '#lib/domain/contracts'
import { getApiUrl } from '#lib/env.ts'
import type { BatchAbiResponse } from '#routes/api/abi/batch'

export function autoloadAbiQueryOptions(args: { address?: Address | null }) {
	const { address } = args

	return queryOptions({
		enabled: Boolean(address),
		gcTime: Number.POSITIVE_INFINITY,
		staleTime: Number.POSITIVE_INFINITY,
		queryKey: ['autoload-abi', address?.toLowerCase()],
		queryFn: () => autoloadAbi(address as Address),
	})
}

/**
 * Batch fetch ABIs and signatures for multiple addresses/selectors.
 * Use this instead of multiple individual queries for better performance.
 */
export function batchAbiQueryOptions(args: {
	addresses: Address[]
	selectors: Hex[]
}) {
	const { addresses, selectors } = args

	// Create stable query key from sorted, deduplicated values
	const sortedAddresses = [...new Set(addresses)].sort()
	const sortedSelectors = [...new Set(selectors)].sort()

	return queryOptions({
		enabled: sortedAddresses.length > 0 || sortedSelectors.length > 0,
		gcTime: Number.POSITIVE_INFINITY,
		staleTime: Number.POSITIVE_INFINITY,
		queryKey: ['batch-abi', sortedAddresses, sortedSelectors],
		queryFn: async (): Promise<BatchAbiResponse> => {
			const response = await fetch(getApiUrl('/api/abi/batch'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					addresses: sortedAddresses,
					selectors: sortedSelectors,
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to fetch batch ABI data')
			}

			return response.json()
		},
	})
}

/**
 * Populate the query cache with individual ABI/signature entries from a batch response.
 * Call this after fetching batch data to enable cache hits for individual lookups.
 */
export function populateCacheFromBatch(
	queryClient: {
		setQueryData: (key: unknown[], data: unknown) => void
	},
	batchData: BatchAbiResponse,
) {
	// Populate individual ABI cache entries
	for (const [address, abi] of Object.entries(batchData.abis)) {
		queryClient.setQueryData(['autoload-abi', address.toLowerCase()], abi)
	}

	// Populate individual signature cache entries
	for (const [selector, signature] of Object.entries(batchData.signatures)) {
		queryClient.setQueryData(['lookup-signature', selector], signature)
	}
}

export function useAutoloadAbi(args: {
	address?: Address | null
	enabled?: boolean
}) {
	const { address, enabled } = args
	const options = autoloadAbiQueryOptions({ address })

	return useQuery({
		...options,
		enabled: enabled && options.enabled,
	})
}

export function lookupSignatureQueryOptions(args: { selector?: Hex }) {
	const { selector } = args

	return queryOptions({
		enabled: Boolean(selector),
		gcTime: Number.POSITIVE_INFINITY,
		staleTime: Number.POSITIVE_INFINITY,
		queryKey: ['lookup-signature', selector],
		queryFn: () => lookupSignature(selector as Hex),
	})
}

export function useLookupSignature(args: {
	enabled?: boolean
	selector?: Hex
}) {
	const { enabled = true, selector } = args
	const options = lookupSignatureQueryOptions({ selector })

	return useQuery({
		...options,
		enabled: enabled && options.enabled,
	})
}
