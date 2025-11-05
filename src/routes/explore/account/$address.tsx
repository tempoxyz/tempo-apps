import { createFileRoute } from '@tanstack/react-router'
import { Address, Json } from 'ox'
import { z } from 'zod/mini'

import { useInfiniteAccountTransactions } from '../-lib/Hooks'

export const Route = createFileRoute('/explore/account/$address')({
	component: RouteComponent,
	params: {
		parse: z.object({
			address: z.pipe(
				z.string(),
				z.transform((x) => {
					Address.assert(x)
					return x
				}),
			),
		}).parse,
	},
})

function RouteComponent() {
	const { address } = Route.useParams()
	const { data } = useInfiniteAccountTransactions({ address })
	return <pre>{Json.stringify(data, null, 2)}</pre>
}
