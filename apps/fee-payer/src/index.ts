import { env } from 'cloudflare:workers'
import { tempo } from 'tempo.ts/chains'
import { Handler } from 'tempo.ts/server'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const headers = new Headers({
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Max-Age': '86400',
})

export default {
	async fetch(request) {
		const origin = request.headers.get('origin')
		if (env.ALLOWED_ORIGINS === '*')
			headers.set('Access-Control-Allow-Origin', '*')
		else if (origin && env.ALLOWED_ORIGINS.includes(origin))
			headers.set('Access-Control-Allow-Origin', origin)

		return await Handler.feePayer({
			account: privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`),
			chain: tempo({ feeToken: '0x20c0000000000000000000000000000000000001' }),
			headers,
			transport: http(env.TEMPO_RPC_URL, {
				fetchOptions: {
					headers: {
						Authorization: `Basic ${btoa(env.TEMPO_RPC_CREDENTIALS)}`,
					},
				},
			}),
			async onRequest(request) {
				console.log(`Sponsoring transaction: ${request.method}`)
			},
		}).fetch(request)
	},
} satisfies ExportedHandler<Env>
