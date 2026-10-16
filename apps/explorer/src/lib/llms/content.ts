/**
 * Descriptions for `/llms.txt` and `/llms-full.txt`. Paths, methods, and
 * parameter types, values, and defaults are read from the routes when the
 * files are served. The types below make `check:types` fail when a route or
 * parameter has no entry here, or an entry names one that no longer exists.
 */

import { api } from '@tempo/llms'
import type { TanStackDocs } from '@tempo/llms/tanstack'
import { liveQuerySchema } from '#lib/live-query'
import { RequestParametersSchema } from '#lib/server/address-history'
import { PUBLIC_METHODS, READ_METHODS } from '#lib/server/rpc'
import type { FileRoutesByFullPath } from '#routeTree.gen.ts'
import { BatchAbiRequestSchema } from '#routes/api/abi/batch'
import { SearchSchema as ZonePortalActivitySchema } from '#routes/api/address/zone-portal/$address/$kind'
import { CodeQuerySchema } from '#routes/api/code'
import { SearchQuerySchema } from '#routes/api/search'
import { SimulationRequestSchema } from '#routes/api/simulate'
import { Tip20RolesQuerySchema } from '#routes/api/tip20-roles'
import { BalanceChangesQuerySchema } from '#routes/api/tx/balance-changes/$hash'

const methodList = (methods: Iterable<string>) =>
	[...methods].map((method) => `\`${method}\``).join(', ')

const pagination = {
	page: 'Page number.',
	limit: 'Rows per page.',
}

/** Routes in display order: pages, then API routes, then hidden routes. */
export const docs = {
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
	'/address/$address': {
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
	'/token/$address': {
		title: 'Token redirect',
		description:
			'Redirects to `/address/{address}`. Without `tab`, TIP-20 tokens open on `tab=token`; links with `a`, and other tokens, open on `tab=transfers`. `holders`, `token`, and `contract` are kept, and `interact` opens `contract`.',
		params: {
			tab: 'Address tab to open.',
			a: 'Account filter, passed through.',
			...pagination,
		},
	},
	'/tx/$hash': {
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
	'/receipt/$hash': {
		title: 'Receipt',
		description:
			'The canonical receipt view of what a transaction did. Append `.json`, `.txt`, or `.pdf` to the hash, or send a matching `Accept` header, for a machine-readable export; `curl` and `wget` receive plain text.',
		params: { voucher: null },
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
	'/block/$id': {
		title: 'Block',
		description:
			'`id` is a block number, block hash, or `latest`. Shows hash, number, timestamp, gas usage, proposer, parent hash, and the block’s transactions.',
		params: { page: 'Page of the block’s transactions.' },
	},
	'/block/countdown/$targetBlock': {
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
	'/policy/$id': {
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
			'Simulate a call or batch against the chain and inspect the result, trace, state changes, events, and gas. Inputs are kept in the URL, so links reproduce the simulation, except calldata or batches too large for a URL.',
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

	'/api/search': api(SearchQuerySchema, {
		title: 'Search',
		description:
			'Searches blocks, addresses, transactions, and tokens. Returns `{ results, query }`, where each result has a `type` of `block`, `address`, `token`, or `transaction`. Use it when the input type is unknown.',
		params: {
			q: {
				description: 'Search query. Without it the response has no results.',
				required: true,
			},
		},
	}),
	'/api/address/metadata/$address': {
		title: 'Address metadata',
		description:
			'Account type, transaction and holder counts, and creation and last-activity details.',
	},
	'/api/address/balances/$address': {
		title: 'Address balances',
		description: 'Token balances held by the address.',
	},
	'/api/address/history/$address': api(RequestParametersSchema, {
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
	}),
	'/api/address/live/$address': api(liveQuerySchema, {
		title: 'Address live feed',
		description: 'Server-sent events stream of new activity for the address.',
		params: {
			address: null, // the path param
			kind: 'Activity to stream.',
			limit: 'Maximum initial rows.',
			account: 'With `kind=token-transfers`, only transfers of this account.',
			direction: 'Transfers into or out of the account.',
			include: 'Transactions sent, received, or both.',
			status: 'Filter by transaction status.',
			after: 'Only activity after this Unix timestamp, in seconds.',
			hideSubmitBatches: 'Hide zone batch submissions.',
		},
	}),
	'/api/address/zone-portal/$address': {
		title: 'Zone portal overview',
		description: 'Summary of a zone portal contract.',
	},
	'/api/address/zone-portal/$address/$kind': api(ZonePortalActivitySchema, {
		title: 'Zone portal activity',
		description: 'Paginated zone portal deposits, withdrawals, or batches.',
		params: pagination,
	}),
	'/api/contract/creation/$address': {
		title: 'Contract creation',
		description: 'Creation transaction and block for a contract.',
	},
	'/api/code': api(CodeQuerySchema, {
		title: 'Contract source',
		description: 'Verified contract source and ABI.',
		params: {
			chainid: 'Chain ID.',
			address: 'Contract address.',
			highlight: 'Include syntax-highlighted source.',
		},
	}),
	'/api/abi/batch': api(BatchAbiRequestSchema, {
		title: 'ABI lookup',
		description:
			'Resolves ABIs for contract addresses and signatures for 4-byte selectors in one request.',
		params: {
			addresses: 'Contract addresses.',
			selectors: 'Function or event selectors.',
		},
	}),
	'/api/tx/balance-changes/$hash': api(BalanceChangesQuerySchema, {
		title: 'Transaction balance changes',
		description: 'Token balance changes caused by the transaction.',
		params: {
			limit: 'Maximum changes to return.',
			offset: 'Changes to skip.',
		},
	}),
	'/api/tx/trace/$hash': {
		title: 'Transaction trace',
		description: 'Call trace and prestate diff.',
	},
	'/api/simulate': api(SimulationRequestSchema, {
		title: 'Simulate',
		description:
			'Simulates a call or batch. Returns the result, or a single `panel` when one is requested.',
		params: {
			chainId:
				'Chain ID of the explorer host’s network; other networks are rejected.',
			from: 'Sender address.',
			to: 'Target address.',
			data: 'Calldata.',
			value: 'Value in base units.',
			gas: 'Gas limit.',
			block: 'Block to simulate against.',
			panel: 'Return only this part of the result.',
			calls:
				'The whole ordered batch as `{ to, data, value }` objects. When set, it replaces the top-level `to`, `data`, and `value`, which are still required.',
		},
	}),
	'/api/tip20-roles': api(Tip20RolesQuerySchema, {
		title: 'TIP-20 roles',
		description: 'Role holders and configuration of a TIP-20 token.',
		params: {
			address: 'Token address.',
			chainId: 'Chain ID. Defaults to the explorer’s chain.',
		},
	}),
	'/api/verified-tokens': {
		title: 'Verified tokens',
		description: 'Curated verified token addresses for the chain.',
	},
	'/api/token/logo/$address': {
		title: 'Token logo',
		description: 'The token’s curated logo image.',
	},
	'/api/rpc': {
		title: 'JSON-RPC',
		description: `Proxies JSON-RPC 2.0 requests, single or batched, to the network’s node. Accepts ${methodList(READ_METHODS)}. Every network except zone-prover also accepts ${methodList([...PUBLIC_METHODS].filter((method) => !READ_METHODS.has(method)))}.`,
	},
	'/api/health': {
		title: 'Health',
		description: 'Returns `ok` when the service is up.',
	},
	'/demo/': { hidden: 'Development-only component demos.' },
	'/demo/address': { hidden: 'Development-only component demos.' },
	'/demo/empty-state': { hidden: 'Development-only component demos.' },
	'/demo/pagination': { hidden: 'Development-only component demos.' },
	'/demo/tx': { hidden: 'Development-only component demos.' },
} satisfies TanStackDocs<FileRoutesByFullPath>
