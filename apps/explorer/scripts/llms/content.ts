/**
 * Hand-written descriptions merged into the generated `llms.txt` and
 * `llms-full.txt`. Paths, methods, parameter names, types, values, and
 * defaults come from `src/routes`; `generate.ts` fails when an entry here is
 * missing or no longer matches a route.
 */

/**
 * A string describes the parameter, `values` also describes each allowed
 * value (in display order), and `null` marks a parameter the route parses but
 * agents should not use.
 */
export type ParamDoc =
	| string
	| { description: string; values: Record<string, string> }
	| null

export type RouteDoc = {
	title: string
	description: string
	params?: Record<string, ParamDoc>
}

const pagination = {
	page: 'Page number.',
	limit: 'Rows per page.',
}

/** Pages, in display order. */
export const pages: Record<string, RouteDoc> = {
	'/': {
		title: 'Home',
		description:
			'Search for an address, transaction hash, block number, or token symbol, name, or address. Results are grouped by blocks, addresses, tokens, and transactions.',
		params: { q: 'Prefills the search input.' },
	},
	'/search': {
		title: 'Search redirect',
		description:
			'Redirects to the matching block, address, receipt, or unique token for `q`, or back to the home search when there is no single match.',
		params: { q: 'Address, transaction hash, block number, or token query.' },
	},
	'/address/{address}': {
		title: 'Address',
		description:
			'Shows an account, contract, or TIP-20 token: type, balances, activity, and creation or last-activity metadata. Transactions and balances can be exported as CSV. The tabs shown depend on the address type.',
		params: {
			tab: {
				description:
					'Address view. Defaults to `token` for TIP-20 tokens and `transactions` otherwise.',
				values: {
					transactions: 'Transaction history.',
					transfers:
						'Token transfers. For a token, every transfer of that token.',
					holdings: 'Current token balances.',
					fees: 'Unclaimed validator fees, when the address has any.',
					holders: 'Holders of the token, when the address is a token.',
					token: 'TIP-20 token metadata and configuration.',
					contract: 'Contract source, ABI, and bytecode, when available.',
					interact:
						'Read and write contract functions, when an ABI is available.',
					deposits: 'Zone portal deposits.',
					withdrawals: 'Zone portal withdrawals.',
					batches: 'Zone portal batches.',
				},
			},
			status: 'Filter transactions by status.',
			period: 'Filter transactions to the last 24 hours or 7 days.',
			dir: 'Filter transactions sent or received by the address.',
			a: 'Filter a token’s transfers to one account address.',
			transferDirection:
				'With `a`, filter transfers into or out of that account.',
			hideSubmitBatches: 'Hide zone batch submissions from transactions.',
			...pagination,
			cursor: null,
			order: null,
			live: null,
			source: null,
			line: null,
			end: null,
			voucher: null,
		},
	},
	'/token/{address}': {
		title: 'Token redirect',
		description:
			'Redirects to `/address/{address}`. TIP-20 tokens open on `tab=token`, other tokens on `tab=transfers`; `holders` and `contract` tabs are preserved.',
		params: {
			tab: 'Address tab to open.',
			a: 'Account filter, passed through.',
			...pagination,
		},
	},
	'/tx/{hash}': {
		title: 'Transaction',
		description: 'Shows transaction details.',
		params: {
			tab: {
				description: 'Transaction view.',
				values: {
					overview: 'Receipt and transaction summary.',
					balances: 'Balance changes.',
					calls: 'Decoded calls, when available.',
					events: 'Raw and decoded logs.',
					trace: 'Call trace and prestate diff, when available.',
					raw: 'Raw transaction and receipt JSON.',
				},
			},
			page: 'Page number for paginated tabs.',
			r: null,
		},
	},
	'/receipt/{hash}': {
		title: 'Receipt',
		description:
			'The canonical receipt view of what a transaction did. Append `.json`, `.txt`, or `.pdf` to the hash, or send a matching `Accept` header, for a machine-readable export; `curl` and `wget` receive plain text.',
		params: { r: null, voucher: null },
	},
	'/blocks': {
		title: 'Blocks',
		description:
			'Recent blocks with number, hash, time, and transaction count. Follows the chain head live unless `from` is set.',
		params: {
			from: 'Start the list at this block number.',
			live: 'Follow new blocks (`true`) or pause the list (`false`).',
		},
	},
	'/block/{id}': {
		title: 'Block',
		description:
			'`id` is a block number, block hash, or `latest`. Shows hash, number, timestamp, gas usage, proposer, parent hash, and the block’s transactions.',
		params: { page: 'Page of the block’s transactions.' },
	},
	'/block/countdown/{targetBlock}': {
		title: 'Block countdown',
		description: 'Estimated time until a future block number.',
	},
	'/tokens': {
		title: 'Tokens',
		description:
			'Discovered TIP-20 tokens with symbol, name, currency, holders, address, and creation time.',
		params: { page: 'Page number.' },
	},
	'/fee-amm': {
		title: 'Fee AMM',
		description:
			'Fee AMM pools discovered from mint activity: pool pair, reserves, liquidity, creation and latest mint time, and mint count. Each pool pairs a fee token with a validator token.',
		params: {
			token: 'Show only pools that include this token address.',
			...pagination,
		},
	},
	'/policy/{id}': {
		title: 'TIP-403 policy',
		description:
			'A TIP-403 transfer policy: type, administrator, members, composed policies, and policy events.',
		params: {
			q: 'Search members by address.',
			page: 'Page of members.',
			limit: 'Members per page.',
		},
	},
	'/simulate': {
		title: 'Simulate',
		description:
			'Simulate a call or batch against the chain and inspect the result, trace, state changes, events, and gas. Every input is kept in the URL, so links reproduce the simulation.',
		params: {
			from: 'Sender address.',
			to: 'Target contract address.',
			data: 'Calldata.',
			value: 'Value in base units.',
			gas: 'Gas limit.',
			block: 'Block to simulate against.',
			tx: 'Load the inputs of an existing transaction.',
			calls: 'Additional batch calls as `[[to, data, value], ...]`.',
			tab: 'Result view.',
			step: 'Narrow results to one call of a batch, by index.',
			pane: null,
			frame: null,
			originStatus: null,
			originGas: null,
			originEvents: null,
			originBalances: null,
		},
	},
}

/** API routes, in display order. */
export const api: Record<string, RouteDoc> = {
	'/api/search': {
		title: 'Search',
		description:
			'Searches blocks, addresses, transactions, and tokens. Returns `{ results, query }`, where each result has a `type` of `block`, `address`, `token`, or `transaction`. Use it when the input type is unknown.',
		params: { q: 'Search query.' },
	},
	'/api/address/metadata/{address}': {
		title: 'Address metadata',
		description:
			'Account type, transaction and holder counts, and creation and last-activity details.',
	},
	'/api/address/balances/{address}': {
		title: 'Address balances',
		description: 'Token balances held by the address.',
	},
	'/api/address/history/{address}': {
		title: 'Address history',
		description: 'Paginated transaction history with decoded activity.',
		params: {
			limit: 'Maximum transactions to return.',
			sort: 'Sort order by block.',
			cursor: 'Cursor from the previous response.',
			include: 'Transactions sent, received, or both.',
			status: 'Filter by transaction status.',
			after: 'Only transactions after this Unix timestamp, in seconds.',
			hideSubmitBatches: 'Hide zone batch submissions.',
		},
	},
	'/api/address/live/{address}': {
		title: 'Address live feed',
		description: 'Server-sent events stream of new activity for the address.',
		params: {
			kind: 'Activity to stream.',
			limit: 'Maximum initial rows.',
			account: 'With `kind=token-transfers`, only transfers of this account.',
			direction: 'Transfers into or out of the account.',
			include: 'Transactions sent, received, or both.',
			status: 'Filter by transaction status.',
			after: 'Only activity after this Unix timestamp, in seconds.',
			hideSubmitBatches: 'Hide zone batch submissions.',
		},
	},
	'/api/address/zone-portal/{address}': {
		title: 'Zone portal overview',
		description: 'Summary of a zone portal contract.',
	},
	'/api/address/zone-portal/{address}/{kind}': {
		title: 'Zone portal activity',
		description: 'Paginated zone portal deposits, withdrawals, or batches.',
		params: pagination,
	},
	'/api/contract/creation/{address}': {
		title: 'Contract creation',
		description: 'Creation transaction and block for a contract.',
	},
	'/api/code': {
		title: 'Contract source',
		description: 'Verified contract source and ABI.',
		params: {
			chainid: 'Chain ID.',
			address: 'Contract address.',
			highlight: 'Include syntax-highlighted source.',
		},
	},
	'/api/abi/batch': {
		title: 'ABI lookup',
		description:
			'Resolves ABIs for contract addresses and signatures for 4-byte selectors in one request.',
		params: {
			addresses: 'Contract addresses.',
			selectors: 'Function or event selectors.',
		},
	},
	'/api/tx/balance-changes/{hash}': {
		title: 'Transaction balance changes',
		description: 'Token balance changes caused by the transaction.',
		params: {
			limit: 'Maximum changes to return.',
			offset: 'Changes to skip.',
		},
	},
	'/api/tx/trace/{hash}': {
		title: 'Transaction trace',
		description: 'Call trace and prestate diff.',
	},
	'/api/simulate': {
		title: 'Simulate',
		description:
			'Simulates a call or batch. Returns the result, or a single `panel` when one is requested.',
		params: {
			chainId: 'Chain ID of the network being simulated.',
			from: 'Sender address.',
			to: 'Target address.',
			data: 'Calldata.',
			value: 'Value in base units.',
			gas: 'Gas limit.',
			block: 'Block to simulate against.',
			panel: 'Return only this part of the result.',
			calls: 'Additional batch calls as `{ to, data, value }` objects.',
		},
	},
	'/api/tip20-roles': {
		title: 'TIP-20 roles',
		description: 'Role holders and configuration of a TIP-20 token.',
		params: {
			address: 'Token address.',
			chainId: 'Chain ID. Defaults to the explorer’s chain.',
		},
	},
	'/api/verified-tokens': {
		title: 'Verified tokens',
		description: 'Curated verified token addresses for the chain.',
	},
	'/api/token/logo/{address}': {
		title: 'Token logo',
		description: 'The token’s curated logo image.',
	},
	'/api/rpc': {
		title: 'JSON-RPC',
		description:
			'Proxies allowlisted JSON-RPC 2.0 requests, single or batched, to the network’s node: standard `eth_*` reads, raw transaction submission, `eth_simulateV1`, and `debug_trace*`.',
	},
	'/api/health': {
		title: 'Health',
		description: 'Returns `ok` when the service is up.',
	},
}

/** Routes left out of the reference, with the reason. */
export const hidden: Record<string, string> = {
	'/_layout': 'Pathless layout; its `plain` flag only drops the page chrome.',
	'/demo': 'Development-only component demos.',
	'/demo/address': 'Development-only component demos.',
	'/demo/empty-state': 'Development-only component demos.',
	'/demo/pagination': 'Development-only component demos.',
	'/demo/tx': 'Development-only component demos.',
}
