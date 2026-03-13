import type { Context, Next } from 'hono'
import { cloneRawRequest } from 'hono/request'
import { RpcRequest } from 'ox'

/**
 * Middleware that blocks `eth_signTransaction` requests.
 *
 * `eth_signTransaction` uses the sponsor's key as the transaction sender,
 * which allows an attacker to execute arbitrary transactions on behalf of the
 * sponsor. Only `eth_signRawTransaction` and `eth_sendRawTransaction` are safe
 * because they preserve the original sender's signature and only add a
 * fee-payer co-signature.
 */
export async function blockSignTransactionMiddleware(c: Context, next: Next) {
	try {
		const clonedRequest = await cloneRawRequest(c.req)
		const request = RpcRequest.from((await clonedRequest.json()) as never)

		if (request.method === 'eth_signTransaction') {
			return c.json(
				{
					jsonrpc: '2.0',
					id: request.id ?? null,
					error: { code: -32601, message: 'Method not supported' },
				},
				403,
			)
		}
	} catch {
		// Let unparseable requests through - handler will return appropriate error
	}

	await next()
}
