import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Address, Hex } from 'viem'
import { autoloadAbi, lookupSignature } from '#lib/domain/contracts'

export function autoloadAbiQueryOptions(args: { address?: Address | null }) {
	const { address } = args

	return queryOptions({
		enabled: Boolean(address),
		gcTime: Number.POSITIVE_INFINITY,
		staleTime: Number.POSITIVE_INFINITY,
		queryKey: ['autoload-abi', address],
		queryFn: () => autoloadAbi(address as Address),
	})
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
