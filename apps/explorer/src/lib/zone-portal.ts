import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'ox'
import * as z from 'zod/mini'
import type {
	ZonePortalActivityKind,
	ZonePortalActivityResponse,
	ZonePortalOverview,
} from '#lib/domain/zones'
import { getApiUrl } from '#lib/env'
import { zAddress, zHash } from '#lib/zod'

const AssetSchema = z.object({
	address: zAddress(),
	balance: z.string(),
	decimals: z.number(),
	symbol: z.string(),
})

const OverviewSchema = z.object({
	isZonePortal: z.literal(true),
	assets: z.array(AssetSchema),
	counts: z.object({
		deposits: z.number(),
		withdrawals: z.number(),
		batches: z.number(),
	}),
})

const BatchReferenceSchema = z.object({
	index: z.string(),
	transactionHash: zHash(),
})

const DepositSchema = z.object({
	kind: z.literal('deposit'),
	timestamp: z.number(),
	transactionHash: zHash(),
	sender: zAddress(),
	token: zAddress(),
	amount: z.string(),
	processedInBatch: z.nullable(BatchReferenceSchema),
})

const WithdrawalSchema = z.object({
	kind: z.literal('withdrawal'),
	timestamp: z.number(),
	transactionHash: zHash(),
	recipient: zAddress(),
	token: zAddress(),
	amount: z.string(),
	processedInBatch: z.nullable(BatchReferenceSchema),
})

const BatchSchema = z.object({
	kind: z.literal('batch'),
	timestamp: z.number(),
	transactionHash: zHash(),
	batchIndex: z.string(),
	withdrawalQueueIndex: z.nullable(z.string()),
	lastProcessedDepositNumber: z.string(),
})

const ActivityResponseSchema = z.object({
	items: z.array(z.union([DepositSchema, WithdrawalSchema, BatchSchema])),
	total: z.number(),
	page: z.number(),
	limit: z.number(),
})

function errorMessage(value: unknown, fallback: string): string {
	if (
		value &&
		typeof value === 'object' &&
		'error' in value &&
		typeof value.error === 'string'
	)
		return value.error
	return fallback
}

export function zonePortalOverviewQueryOptions(address: Address.Address) {
	return queryOptions({
		queryKey: ['zone-portal-overview', address],
		queryFn: async ({ signal }): Promise<ZonePortalOverview> => {
			const response = await fetch(
				getApiUrl(`/api/address/zone-portal/${address}`),
				{ signal },
			)
			const json: unknown = await response.json()
			if (!response.ok) {
				throw new Error(errorMessage(json, 'Failed to load Zone Portal'))
			}
			return z.parse(OverviewSchema, json)
		},
		staleTime: 4_000,
		refetchOnWindowFocus: true,
	})
}

export function zonePortalActivityQueryOptions(params: {
	address: Address.Address
	kind: ZonePortalActivityKind
	page: number
	limit: number
}) {
	const search = new URLSearchParams({
		page: String(params.page),
		limit: String(params.limit),
	})
	return queryOptions({
		queryKey: [
			'zone-portal-activity',
			params.address,
			params.kind,
			params.page,
			params.limit,
		],
		queryFn: async ({ signal }): Promise<ZonePortalActivityResponse> => {
			const response = await fetch(
				getApiUrl(
					`/api/address/zone-portal/${params.address}/${params.kind}`,
					search,
				),
				{ signal },
			)
			const json: unknown = await response.json()
			if (!response.ok) {
				throw new Error(
					errorMessage(json, 'Failed to load Zone Portal activity'),
				)
			}
			return z.parse(ActivityResponseSchema, json)
		},
		staleTime: 4_000,
		refetchOnWindowFocus: true,
	})
}
