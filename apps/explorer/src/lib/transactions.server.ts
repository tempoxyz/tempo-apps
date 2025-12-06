import { createServerFn } from '@tanstack/react-start'
import type { Address } from 'ox'
import * as z from 'zod/mini'
import * as IS from '#lib/index-supply'
import { zAddress } from '#lib/zod'

export const FetchTotalAddressTxsSchema = z.object({
	address: zAddress({ lowercase: true }),
	chainId: z.coerce.number(),
})

const query = (address: Address.Address) => /* sql */ `
SELECT SUM(CASE WHEN "from" = '${address}' THEN 1 ELSE 0 END) as sent, 
       SUM(CASE WHEN "to" = '${address}' THEN 1 ELSE 0 END) as received 
FROM txs 
WHERE ("from" = '${address}' OR "to" = '${address}')
`

export const fetchTotalAddressTxs = createServerFn({ method: 'GET' })
	.inputValidator((input) => FetchTotalAddressTxsSchema.parse(input))
	.handler(async ({ data: { address, chainId } }) => {
		const result =
			await IS.runIndexSupplyQuery(/* sql */ `${query(address)} AND chain = ${chainId}
`)

		const cursor = result.cursor
		if (!cursor?.includes('-')) return 0n

		const [, total] = cursor.split('-')

		return BigInt(total)
	})
