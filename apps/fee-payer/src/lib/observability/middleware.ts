import type { Context, MiddlewareHandler } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { cloneRawRequest } from 'hono/request'
import { Hex, RpcRequest } from 'ox'
import { Transaction } from 'viem/tempo'
import * as z from 'zod/mini'
import { tempoChain } from '../chain.js'
import { metrics } from './metrics.js'

export function httpMetrics(): MiddlewareHandler {
	return createMiddleware(async (c, next) => {
		const start = performance.now()
		let thrown: unknown

		try {
			await next()
		} catch (error) {
			thrown = error
			throw error
		} finally {
			const tags = {
				method: c.req.method,
				route: resolveRoute(c),
			}
			const error = thrown ?? c.error
			const hasError = error !== undefined
			const status = hasError
				? statusFromError(error, c.res.status)
				: c.res.status

			metrics.count('http_request_count', 1, tags)
			metrics.histogram(
				'http_response_duration_ms',
				performance.now() - start,
				tags,
			)
			metrics.count('http_response_count', 1, {
				...tags,
				status,
				...(hasError ? { error_type: errorTypeOf(error) } : {}),
			})
			metrics.flush()
		}
	})
}

export function rpcMetrics(opts: { keyed: boolean }): MiddlewareHandler {
	return createMiddleware(async (c, next) => {
		const rpc = await resolveRpcContext(c)
		let thrown: unknown

		if (rpc) {
			c.set('rpcMethod', rpc.method)
			metrics.count('fee_payer_rpc_request_count', 1, {
				rpc_method: rpc.method,
				keyed_route: String(opts.keyed),
				chain_id: String(rpc.chainId),
			})
		}

		try {
			await next()
		} catch (error) {
			thrown = error
			throw error
		} finally {
			if (rpc) {
				metrics.count('fee_payer_sponsorship_response_count', 1, {
					rpc_method: rpc.method,
					keyed_route: String(opts.keyed),
					chain_id: String(rpc.chainId),
					status:
						thrown || c.error
							? 'error'
							: await sponsorshipResponseStatus(c.res),
				})
			}
		}
	})
}

function resolveRoute(c: Context): string {
	const routePath = c.req.routePath
	if (routePath && routePath !== '/*') return routePath
	const path = new URL(c.req.url).pathname
	if (path === '/') return '/'
	if (path.startsWith('/tp_') && path.length > '/tp_'.length)
		return '/:key{tp_.+}'
	if (routePath === '/*') return 'unmatched'
	return path
}

function statusFromError(error: unknown, responseStatus: number): number {
	if (error instanceof HTTPException) return error.status
	if (responseStatus >= 400) return responseStatus
	return 500
}

function errorTypeOf(error: unknown): string {
	if (error instanceof Error) return error.constructor.name
	if (error === null) return 'null'
	return typeof error
}

type RpcMetricsContext = {
	chainId: number
	method: string
}

async function resolveRpcContext(
	c: Context,
): Promise<RpcMetricsContext | undefined> {
	try {
		const clonedRequest = await cloneRawRequest(c.req)
		const rawBody = z.safeParse(
			z.object({
				jsonrpc: z.string(),
				id: z.number(),
				method: z.string(),
				params: z.optional(z.array(z.unknown())),
			}),
			await clonedRequest.json(),
		)
		if (!rawBody.success) return undefined

		const request = RpcRequest.from(rawBody.data)
		return {
			chainId: resolveRpcChainId(request.params?.[0]) ?? tempoChain.id,
			method: request.method,
		}
	} catch {
		return undefined
	}
}

function resolveRpcChainId(params: unknown): number | undefined {
	if (params && typeof params === 'object')
		return resolveChainId((params as { chainId?: unknown }).chainId)

	if (
		typeof params === 'string' &&
		(params.startsWith('0x76') || params.startsWith('0x78')) &&
		Hex.validate(params)
	) {
		try {
			const transaction = Transaction.deserialize(params) as {
				chainId?: unknown
			}
			return resolveChainId(transaction.chainId)
		} catch {
			return undefined
		}
	}

	return undefined
}

function resolveChainId(value: unknown): number | undefined {
	if (typeof value === 'number') return value
	if (typeof value === 'bigint') return Number(value)
	if (typeof value === 'string') {
		if (Hex.validate(value)) return Hex.toNumber(value)
		const n = Number(value)
		if (Number.isFinite(n)) return n
	}
	return undefined
}

async function sponsorshipResponseStatus(
	response: Response,
): Promise<'success' | 'error'> {
	if (!response.ok) return 'error'

	try {
		const body: unknown = await response.clone().json()
		if (Array.isArray(body))
			return body.some(hasJsonRpcError) ? 'error' : 'success'
		return hasJsonRpcError(body) ? 'error' : 'success'
	} catch {
		return 'success'
	}
}

function hasJsonRpcError(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false
	if (!('error' in value)) return false
	return (value as { error?: unknown }).error != null
}
