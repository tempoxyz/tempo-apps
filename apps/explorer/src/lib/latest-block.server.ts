import { createServerFn } from '@tanstack/react-start'
import * as IS from '#lib/index-supply'

export const fetchLatestBlock = createServerFn({ method: 'GET' }).handler(
	async () => {
		const result = await IS.runIndexSupplyQuery(`
			SELECT num FROM blocks
			WHERE chain = ${IS.chainId}
			ORDER BY num DESC
			LIMIT 1
		`)
		return IS.toBigInt(result.rows[0]?.[0])
	},
)
