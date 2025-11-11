import { createFileRoute } from '@tanstack/react-router'
import { Json } from 'ox'
import { isHex } from 'viem'
import { useBlock } from 'wagmi'
import { getBlockNumber } from 'wagmi/actions'
import { z } from 'zod/mini'
import { config } from '#wagmi.config'

/**
 * id is block number or block hash
 */

export const Route = createFileRoute('/_layout/block/$id')({
	component: RouteComponent,
	params: {
		parse: z.object({
			id: z.string(),
		}).parse,
	},
	loader: async ({ params }) => {
		const { id } = params
		if (isHex(id)) {
			const blockNumber = await getBlockNumber(config)
			return { blockNumber }
		}
		if (Number.isSafeInteger(Number(id))) return { blockNumber: BigInt(id) }
		throw new Error('Invalid block id')
	},
})

function RouteComponent() {
	const { blockNumber } = Route.useLoaderData()

	const { data: block } = useBlock({
		blockNumber,
	})

	return (
		<section className="size-full flex-1 flex justify-center items-center pt-8">
			<pre className="w-full max-w-3xl overflow-x-scroll text-sm bg-surface p-3">
				{Json.stringify(block, null, 2)}
			</pre>
		</section>
	)
}
