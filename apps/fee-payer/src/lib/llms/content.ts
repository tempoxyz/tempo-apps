/**
 * Descriptions for `/llms.txt` and `/llms-full.txt`. Paths, methods, and
 * parameter types and defaults are read from the app's routes when the files
 * are served. The types below make `check:types` fail when a route has no
 * entry here, an entry names one that no longer exists, or a validated route
 * is not documented with the schema its validator parses.
 */

import { api } from '@tempo/llms'
import type { HonoDocs } from '@tempo/llms/hono'
import type { App } from '../../index.js'
import { UsageQuerySchema } from '../usage.js'

const admin = { hidden: 'Admin API, authenticated by the admin secret.' }
const self = { hidden: 'Rendered from these docs.' }

/** Routes in display order: public routes, then hidden routes. */
export const docs = {
	'/': {
		title: 'Sponsor',
		description:
			'JSON-RPC 2.0 endpoint that sponsors Tempo transactions and forwards other methods to the node. Mainnet rejects requests without an API key; use `/{key}` there.',
	},
	'/$key': {
		title: 'Sponsor with an API key',
		description:
			'The same endpoint, authenticated by an API key (`tp_...`) as the path. The key’s daily spend limit and allowed destinations apply to sponsored raw transactions.',
	},
	'/usage': api(UsageQuerySchema, {
		title: 'Usage',
		description:
			'Fees the sponsor has paid: `{ feePayerAddress, feesPaid, feeCurrency, numTransactions, startingAt, endingAt }`, with `feesPaid` as a decimal string. Timestamps are rounded down to the minute and responses are cached for 60 seconds.',
		params: {
			blockTimestampFrom:
				'Only fees paid at or after this Unix timestamp, in seconds.',
			blockTimestampTo:
				'Only fees paid at or before this Unix timestamp, in seconds.',
		},
	}),
	'/llms.txt': self,
	'/llms-full.txt': self,
	'/admin/keys': admin,
	'/admin/keys/$key': admin,
} satisfies HonoDocs<App>
