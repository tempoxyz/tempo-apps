import { createFileRoute } from '@tanstack/react-router'
import type { PaymentsSnapshot } from '#lib/payments'
import { getPaymentsSnapshot } from '#lib/server/payments-data'
import { getTempoChain } from '#wagmi.config'

export type PaymentsApiResponse = PaymentsSnapshot & { chainId: number }

/**
 * The snapshot the Payments page draws, as read-only JSON, so other sites
 * (tempo.com/stats) show the same numbers without a second pipeline.
 *
 * `days` holds one entry per UTC day from the first transfer through today:
 * that day's Total Payments Volume (`tpv`) and the Assets on Platform at its
 * close (`stablecoin`, `rwa`, `crypto`), all in USD. `through` is the last
 * full day, `asOf` when the snapshot was built (ms), `fxDate` the date of
 * the FX rates and `unpriced` any price keys left out for lack of a price.
 */
export const Route = createFileRoute('/api/payments')({
	server: {
		handlers: {
			GET: async () => {
				const chainId = getTempoChain().id
				try {
					const snapshot = await getPaymentsSnapshot(chainId)
					return Response.json(
						{ chainId, ...snapshot } satisfies PaymentsApiResponse,
						{ headers: { 'Cache-Control': 'public, max-age=300' } },
					)
				} catch (error) {
					console.error('Failed to load payments:', error)
					return Response.json(
						{ error: 'Payments data is unavailable right now.' },
						{ status: 503, headers: { 'Cache-Control': 'no-store' } },
					)
				}
			},
		},
	},
})
