import { getChainId } from 'wagmi/actions'
import type { ApiError, ApiResponse, PaginatedResponse, PaginationMeta } from './_types'
import { getWagmiConfig } from '#wagmi.config'

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
}

const CACHE_HEADERS = {
	'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
}

export function jsonResponse<T>(
	data: T,
	options?: { status?: number; cache?: boolean },
): Response {
	const chainId = getChainId(getWagmiConfig())
	const response: ApiResponse<T> = {
		data,
		meta: {
			chainId,
			timestamp: Date.now(),
		},
	}
	return Response.json(response, {
		status: options?.status ?? 200,
		headers: {
			...CORS_HEADERS,
			...(options?.cache !== false ? CACHE_HEADERS : {}),
		},
	})
}

export function paginatedResponse<T>(
	data: T,
	pagination: PaginationMeta,
	options?: { status?: number; cache?: boolean },
): Response {
	const chainId = getChainId(getWagmiConfig())
	const response: PaginatedResponse<T> = {
		data,
		pagination,
		meta: {
			chainId,
			timestamp: Date.now(),
		},
	}
	return Response.json(response, {
		status: options?.status ?? 200,
		headers: {
			...CORS_HEADERS,
			...(options?.cache !== false ? CACHE_HEADERS : {}),
		},
	})
}

export function errorResponse(
	code: string,
	message: string,
	status: number,
	details?: unknown,
): Response {
	const response: ApiError = {
		error: {
			code,
			message,
			...(details ? { details } : {}),
		},
	}
	return Response.json(response, {
		status,
		headers: CORS_HEADERS,
	})
}

export function badRequest(message: string, details?: unknown): Response {
	return errorResponse('BAD_REQUEST', message, 400, details)
}

export function notFound(message: string): Response {
	return errorResponse('NOT_FOUND', message, 404)
}

export function serverError(message: string, details?: unknown): Response {
	return errorResponse('INTERNAL_ERROR', message, 500, details)
}

export function corsPreflightResponse(): Response {
	return new Response(null, {
		status: 204,
		headers: {
			...CORS_HEADERS,
			'Access-Control-Max-Age': '86400',
		},
	})
}

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100

export function parsePagination(url: URL): { limit: number; offset: number } {
	const limitParam = url.searchParams.get('limit')
	const offsetParam = url.searchParams.get('offset')

	let limit = limitParam ? Number.parseInt(limitParam, 10) : DEFAULT_LIMIT
	if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT
	if (limit > MAX_LIMIT) limit = MAX_LIMIT

	let offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0
	if (Number.isNaN(offset) || offset < 0) offset = 0

	return { limit, offset }
}
