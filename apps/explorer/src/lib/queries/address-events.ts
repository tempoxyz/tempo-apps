import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { Address, Hex } from 'ox'

export type AddressEventData = {
	txHash: Hex.Hex
	blockNumber: Hex.Hex
	blockTimestamp: number | null
	logIndex: number
	contractAddress: Address.Address
	topics: Hex.Hex[]
	data: Hex.Hex
}

export type AddressEventsApiResponse = {
	events: AddressEventData[]
	total: number
	offset: number
	limit: number
	hasMore: boolean
	error: null | string
}

type AddressEventsRequestParameters = {
	offset: number
	limit: number
}

export function addressEventsQueryOptions(
	params: {
		page: number
		address: Address.Address
	} & AddressEventsRequestParameters,
) {
	const searchParams = new URLSearchParams({
		limit: params.limit.toString(),
		offset: params.offset.toString(),
	})
	return queryOptions({
		queryKey: [
			'account-events',
			params.address,
			params.page,
			params.limit,
			params.offset,
		],
		queryFn: async (): Promise<AddressEventsApiResponse> => {
			const response = await fetch(
				`${__BASE_URL__}/api/address/events/${params.address}?${searchParams}`,
			)
			const data = await response.json()
			return data as AddressEventsApiResponse
		},
		staleTime: 10_000,
		refetchInterval: false,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
	})
}

export type AddressEventsData = Awaited<
	ReturnType<NonNullable<ReturnType<typeof addressEventsQueryOptions>['queryFn']>>
>

export type AddressEventsCountResponse = {
	data: number | null
	isExact: boolean
	error: string | null
}

export function addressEventsCountQueryOptions(address: Address.Address) {
	return queryOptions({
		queryKey: ['address-events-count', address],
		queryFn: async (): Promise<AddressEventsCountResponse> => {
			const response = await fetch(
				`${__BASE_URL__}/api/address/events-count/${address}`,
			)
			return response.json() as Promise<AddressEventsCountResponse>
		},
		staleTime: 60_000,
		retry: false,
	})
}
