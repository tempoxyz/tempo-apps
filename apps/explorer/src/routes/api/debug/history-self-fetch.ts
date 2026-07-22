import { parseResponse } from 'hono/client'
import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'ox'
import type { Config } from 'wagmi'
import { Actions } from 'wagmi/tempo'
import { api } from '#lib/server/tempo-api'
import { getRequestURL } from '#lib/env'
import { getWagmiConfig } from '#wagmi.config'

const ADDRESS = '0xF6d070e84dBcFa97aCeAaCb650e3c804A95692a5' as Address.Address
const TOKENS = [
	'0x20c0000000000000000000000000000000000000',
	'0x20c000000000000000000000d65b4808c85dbb81',
] as const satisfies readonly Address.Address[]

async function timed<T>(fn: () => Promise<T>) {
	const start = performance.now()
	try {
		const value = await fn()
		return { durationMs: Math.round(performance.now() - start), value }
	} catch (error) {
		return {
			durationMs: Math.round(performance.now() - start),
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

export const Route = createFileRoute('/api/debug/history-self-fetch')({
	server: {
		handlers: {
			GET: async () => {
				const transactions = await timed(async () => {
					const result = await parseResponse(
						api.v1.transactions.$get({
							query: {
								chainId: '4217',
								address: ADDRESS,
								order: 'desc',
								limit: '10',
								include: 'receipt,totalCount',
							},
						}),
					)
					return { rows: result.data.length }
				})

				const config = getWagmiConfig()
				const metadata = await Promise.all(
					TOKENS.map((token) =>
						timed(async () => {
							const result = await Actions.token.getMetadata(config as Config, {
								token,
							})
							return { symbol: result.symbol }
						}),
					),
				)

				const historyUrl = new URL(
					`/api/address/history/${ADDRESS}`,
					getRequestURL(),
				)
				historyUrl.search = new URLSearchParams({
					include: 'all',
					limit: '10',
					page: '1',
					bench: crypto.randomUUID(),
				}).toString()
				const selfFetch = await timed(async () => {
					const response = await fetch(historyUrl, {
						signal: AbortSignal.timeout(10_000),
					})
					await response.arrayBuffer()
					return { status: response.status }
				})

				return Response.json({ transactions, metadata, selfFetch })
			},
		},
	},
})
