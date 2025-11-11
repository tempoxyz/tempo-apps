import { createFileRoute } from '@tanstack/react-router'
import { Address } from 'ox'
import * as z from 'zod/mini'

export const Route = createFileRoute('/explore/asset/$address')({
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
	return <div>Hello "/explore/asset/$asset"!</div>
}
