import { tempo } from 'tempo.ts/chains'
import { Handler } from 'tempo.ts/server'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export interface Env {
	SPONSOR_PRIVATE_KEY: string
	TEMPO_RPC_URL?: string
	TEMPO_RPC_USERNAME: string
	TEMPO_RPC_PASSWORD: string
	ALLOWED_ORIGINS?: string
}

const CORS_HEADERS = {
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Max-Age': '86400',
}

function getCorsHeaders(origin: string | null, env: Env): HeadersInit {
	const allowedOrigins = env.ALLOWED_ORIGINS?.split(',').map((o) =>
		o.trim(),
	) || ['*']

	if (
		allowedOrigins.includes('*') ||
		(origin && allowedOrigins.includes(origin))
	) {
		return {
			...CORS_HEADERS,
			'Access-Control-Allow-Origin': origin || '*',
		}
	}

	return CORS_HEADERS
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const origin = request.headers.get('Origin')
		const corsHeaders = getCorsHeaders(origin, env)

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 200,
				headers: corsHeaders,
			})
		}

		const rpcUrl = env.TEMPO_RPC_URL || 'https://rpc.testnet.tempo.xyz'
		const creds = `${env.TEMPO_RPC_USERNAME}:${env.TEMPO_RPC_PASSWORD}`

		const handler = Handler.feePayer({
			account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
			chain: tempo({ feeToken: '0x20c0000000000000000000000000000000000001' }),
			transport: http(rpcUrl, {
				fetchOptions: {
					headers: {
						Authorization: `Basic ${btoa(creds)}`,
					},
				},
			}),
			onRequest: async (request) => {
				console.log(`Sponsoring transaction: ${request.method}`)
			},
		})

		// note: we pass a clone of the request to avoid mutating the original request
		const response = await handler.fetch(request.clone())

		// Add CORS headers to response
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: {
				...Object.fromEntries(response.headers),
				...corsHeaders,
			},
		})
	},
}
