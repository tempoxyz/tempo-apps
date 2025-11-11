import { createFileRoute, redirect } from '@tanstack/react-router'
import { Address, Hex } from 'ox'
import { z } from 'zod/mini'

export const Route = createFileRoute('/_layout/$value')({
	component: Component,
	headers: () => ({
		...(import.meta.env.PROD
			? {
					'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
				}
			: {}),
	}),
	pendingMs: 10_000, // defer to pending state to prev page
	async beforeLoad({ params }) {
		const { value } = params

		if (Address.validate(value))
			throw redirect({
				to: '/account/$address',
				params: { address: value },
			})

		if (Hex.size(value) === 32)
			throw redirect({ to: '/receipt/$hash', params: { hash: value } })

		return { type: 'unknown' } as const
	},
	params: {
		parse: z.object({
			value: z.pipe(
				z.string(),
				z.transform((x) => {
					Hex.assert(x)
					// 20 bytes (address) or 32 bytes (hash)
					if (Hex.size(x) !== 20 && Hex.size(x) !== 32)
						throw new Error('Must be a valid address or block/transaction hash')
					return x
				}),
			),
		}).parse,
	},
})

function Component() {
	return 'TODO'
}
