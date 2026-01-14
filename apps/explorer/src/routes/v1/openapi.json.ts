import { createFileRoute } from '@tanstack/react-router'
import { getChainId } from 'wagmi/actions'
import { corsPreflightResponse } from './_utils'
import { getWagmiConfig } from '#wagmi.config.ts'

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
}

export const Route = createFileRoute('/v1/openapi.json')({
	server: {
		handlers: {
			OPTIONS: corsPreflightResponse,

			GET: async () => {
				const chainId = getChainId(getWagmiConfig())

				const spec = {
					openapi: '3.1.0',
					info: {
						title: 'Tempo Explorer API',
						version: '1.0.0',
						description:
							'Public API for the Tempo blockchain explorer. Access transaction data, token information, address balances, and more.',
						contact: {
							name: 'Tempo',
							url: 'https://tempo.xyz',
						},
						license: {
							name: 'MIT',
							url: 'https://opensource.org/licenses/MIT',
						},
					},
					servers: [
						{
							url: 'https://explore.tempo.xyz/v1',
							description: 'Production (Testnet)',
						},
						{
							url: 'http://localhost:3000/v1',
							description: 'Local development',
						},
					],
					tags: [
						{
							name: 'Addresses',
							description: 'Address information and transactions',
						},
						{
							name: 'Transactions',
							description: 'Transaction details and balance changes',
						},
						{ name: 'Tokens', description: 'Token information and transfers' },
						{ name: 'Blocks', description: 'Block information' },
						{ name: 'Search', description: 'Search the blockchain' },
						{ name: 'Stats', description: 'Chain statistics' },
					],
					paths: {
						'/addresses/{address}': {
							get: {
								tags: ['Addresses'],
								summary: 'Get address info',
								description:
									'Returns overview information for an address including transaction count and total value',
								operationId: 'getAddress',
								parameters: [
									{
										name: 'address',
										in: 'path',
										required: true,
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
										description: 'The address to look up',
									},
								],
								responses: {
									'200': {
										description: 'Address information',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/AddressInfo' },
											},
										},
									},
									'400': {
										description: 'Invalid address format',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/ApiError' },
											},
										},
									},
								},
							},
						},
						'/addresses/transactions/{address}': {
							get: {
								tags: ['Addresses'],
								summary: 'Get address transactions',
								description: 'Returns paginated transactions for an address',
								operationId: 'getAddressTransactions',
								parameters: [
									{
										name: 'address',
										in: 'path',
										required: true,
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
									},
									{
										name: 'limit',
										in: 'query',
										schema: { type: 'integer', default: 20, maximum: 100 },
									},
									{
										name: 'offset',
										in: 'query',
										schema: { type: 'integer', default: 0 },
									},
									{
										name: 'sort',
										in: 'query',
										schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
									},
									{
										name: 'filter',
										in: 'query',
										schema: {
											type: 'string',
											enum: ['all', 'sent', 'received'],
											default: 'all',
										},
									},
								],
								responses: {
									'200': {
										description: 'Paginated list of transactions',
										content: {
											'application/json': {
												schema: {
													$ref: '#/components/schemas/PaginatedTransactions',
												},
											},
										},
									},
								},
							},
						},
						'/addresses/balances/{address}': {
							get: {
								tags: ['Addresses'],
								summary: 'Get address token balances',
								description: 'Returns all token balances for an address',
								operationId: 'getAddressBalances',
								parameters: [
									{
										name: 'address',
										in: 'path',
										required: true,
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
									},
								],
								responses: {
									'200': {
										description: 'List of token balances',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/TokenBalances' },
											},
										},
									},
								},
							},
						},
						'/transactions/{hash}': {
							get: {
								tags: ['Transactions'],
								summary: 'Get transaction details',
								description: 'Returns detailed information about a transaction',
								operationId: 'getTransaction',
								parameters: [
									{
										name: 'hash',
										in: 'path',
										required: true,
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' },
										description: 'Transaction hash',
									},
								],
								responses: {
									'200': {
										description: 'Transaction details',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/TransactionInfo' },
											},
										},
									},
									'404': {
										description: 'Transaction not found',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/ApiError' },
											},
										},
									},
								},
							},
						},
						'/transactions/balance-changes/{hash}': {
							get: {
								tags: ['Transactions'],
								summary: 'Get transaction balance changes',
								description:
									'Returns token balance changes caused by a transaction',
								operationId: 'getTransactionBalanceChanges',
								parameters: [
									{
										name: 'hash',
										in: 'path',
										required: true,
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' },
									},
									{
										name: 'limit',
										in: 'query',
										schema: { type: 'integer', default: 20, maximum: 100 },
									},
									{
										name: 'offset',
										in: 'query',
										schema: { type: 'integer', default: 0 },
									},
								],
								responses: {
									'200': {
										description: 'Paginated balance changes',
										content: {
											'application/json': {
												schema: {
													$ref: '#/components/schemas/PaginatedBalanceChanges',
												},
											},
										},
									},
								},
							},
						},
						'/tokens': {
							get: {
								tags: ['Tokens'],
								summary: 'List tokens',
								description: 'Returns a paginated list of tokens',
								operationId: 'listTokens',
								parameters: [
									{
										name: 'limit',
										in: 'query',
										schema: { type: 'integer', default: 20, maximum: 100 },
									},
									{
										name: 'offset',
										in: 'query',
										schema: { type: 'integer', default: 0 },
									},
								],
								responses: {
									'200': {
										description: 'Paginated list of tokens',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/PaginatedTokens' },
											},
										},
									},
								},
							},
						},
						'/tokens/{address}': {
							get: {
								tags: ['Tokens'],
								summary: 'Get token info',
								description: 'Returns information about a specific token',
								operationId: 'getToken',
								parameters: [
									{
										name: 'address',
										in: 'path',
										required: true,
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
									},
								],
								responses: {
									'200': {
										description: 'Token information',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/TokenInfo' },
											},
										},
									},
									'404': {
										description: 'Token not found',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/ApiError' },
											},
										},
									},
								},
							},
						},
						'/tokens/transfers/{address}': {
							get: {
								tags: ['Tokens'],
								summary: 'Get token transfers',
								description: 'Returns paginated transfer events for a token',
								operationId: 'getTokenTransfers',
								parameters: [
									{
										name: 'address',
										in: 'path',
										required: true,
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
									},
									{
										name: 'limit',
										in: 'query',
										schema: { type: 'integer', default: 20, maximum: 100 },
									},
									{
										name: 'offset',
										in: 'query',
										schema: { type: 'integer', default: 0 },
									},
									{
										name: 'account',
										in: 'query',
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
										description: 'Filter transfers by a specific account',
									},
								],
								responses: {
									'200': {
										description: 'Paginated token transfers',
										content: {
											'application/json': {
												schema: {
													$ref: '#/components/schemas/PaginatedTransfers',
												},
											},
										},
									},
								},
							},
						},
						'/tokens/holders/{address}': {
							get: {
								tags: ['Tokens'],
								summary: 'Get token holders',
								description: 'Returns paginated list of token holders sorted by balance',
								operationId: 'getTokenHolders',
								parameters: [
									{
										name: 'address',
										in: 'path',
										required: true,
										schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
									},
									{
										name: 'limit',
										in: 'query',
										schema: { type: 'integer', default: 20, maximum: 100 },
									},
									{
										name: 'offset',
										in: 'query',
										schema: { type: 'integer', default: 0 },
									},
								],
								responses: {
									'200': {
										description: 'Paginated token holders',
										content: {
											'application/json': {
												schema: {
													$ref: '#/components/schemas/PaginatedHolders',
												},
											},
										},
									},
								},
							},
						},
						'/blocks': {
							get: {
								tags: ['Blocks'],
								summary: 'List blocks',
								description: 'Returns a paginated list of recent blocks',
								operationId: 'listBlocks',
								parameters: [
									{
										name: 'limit',
										in: 'query',
										schema: { type: 'integer', default: 20, maximum: 100 },
									},
									{
										name: 'offset',
										in: 'query',
										schema: { type: 'integer', default: 0 },
									},
								],
								responses: {
									'200': {
										description: 'Paginated list of blocks',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/PaginatedBlocks' },
											},
										},
									},
								},
							},
						},
						'/blocks/{id}': {
							get: {
								tags: ['Blocks'],
								summary: 'Get block info',
								description:
									'Returns information about a specific block by number or hash',
								operationId: 'getBlock',
								parameters: [
									{
										name: 'id',
										in: 'path',
										required: true,
										schema: { type: 'string' },
										description: 'Block number or block hash',
									},
								],
								responses: {
									'200': {
										description: 'Block information',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/BlockInfo' },
											},
										},
									},
									'404': {
										description: 'Block not found',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/ApiError' },
											},
										},
									},
								},
							},
						},
						'/search': {
							get: {
								tags: ['Search'],
								summary: 'Search the blockchain',
								description:
									'Search for addresses, transactions, and tokens by query string',
								operationId: 'search',
								parameters: [
									{
										name: 'q',
										in: 'query',
										required: true,
										schema: { type: 'string' },
										description:
											'Search query (address, transaction hash, or token name/symbol)',
									},
								],
								responses: {
									'200': {
										description: 'Search results',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/SearchResults' },
											},
										},
									},
								},
							},
						},
						'/stats': {
							get: {
								tags: ['Stats'],
								summary: 'Get chain stats',
								description: 'Returns chain-level statistics',
								operationId: 'getStats',
								responses: {
									'200': {
										description: 'Chain statistics',
										content: {
											'application/json': {
												schema: { $ref: '#/components/schemas/ChainStats' },
											},
										},
									},
								},
							},
						},
					},
					components: {
						schemas: {
							ApiError: {
								type: 'object',
								properties: {
									error: {
										type: 'object',
										properties: {
											code: { type: 'string' },
											message: { type: 'string' },
											details: {},
										},
										required: ['code', 'message'],
									},
								},
								required: ['error'],
							},
							Pagination: {
								type: 'object',
								properties: {
									total: { type: 'integer' },
									offset: { type: 'integer' },
									limit: { type: 'integer' },
									hasMore: { type: 'boolean' },
								},
								required: ['total', 'offset', 'limit', 'hasMore'],
							},
							Meta: {
								type: 'object',
								properties: {
									chainId: { type: 'integer' },
									timestamp: { type: 'integer' },
								},
							},
							AddressInfo: {
								type: 'object',
								properties: {
									data: {
										type: 'object',
										properties: {
											address: { type: 'string' },
											transactionCount: { type: 'integer' },
											totalValue: { type: 'number' },
											firstActivityBlock: { type: 'string', nullable: true },
											lastActivityBlock: { type: 'string', nullable: true },
										},
									},
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							TransactionInfo: {
								type: 'object',
								properties: {
									data: {
										type: 'object',
										properties: {
											hash: { type: 'string' },
											blockNumber: { type: 'string' },
											blockHash: { type: 'string', nullable: true },
											from: { type: 'string' },
											to: { type: 'string', nullable: true },
											value: { type: 'string' },
											input: { type: 'string' },
											nonce: { type: 'string' },
											gas: { type: 'string' },
											gasPrice: { type: 'string' },
											gasUsed: { type: 'string' },
											status: {
												type: 'string',
												enum: ['success', 'reverted'],
											},
											timestamp: { type: 'integer' },
										},
									},
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							TokenInfo: {
								type: 'object',
								properties: {
									data: {
										type: 'object',
										properties: {
											address: { type: 'string' },
											symbol: { type: 'string' },
											name: { type: 'string' },
											currency: { type: 'string' },
											createdAt: { type: 'integer' },
										},
									},
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							BlockInfo: {
								type: 'object',
								properties: {
									data: {
										type: 'object',
										properties: {
											number: { type: 'string' },
											hash: { type: 'string' },
											parentHash: { type: 'string' },
											timestamp: { type: 'integer' },
											gasUsed: { type: 'string' },
											gasLimit: { type: 'string' },
											baseFeePerGas: { type: 'string', nullable: true },
											transactionCount: { type: 'integer' },
										},
									},
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							ChainStats: {
								type: 'object',
								properties: {
									data: {
										type: 'object',
										properties: {
											latestBlock: { type: 'string' },
											tokenCount: { type: 'integer' },
										},
									},
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							SearchResults: {
								type: 'object',
								properties: {
									data: {
										type: 'array',
										items: {
											oneOf: [
												{
													type: 'object',
													properties: {
														type: { type: 'string', const: 'address' },
														address: { type: 'string' },
														isTip20: { type: 'boolean' },
													},
												},
												{
													type: 'object',
													properties: {
														type: { type: 'string', const: 'transaction' },
														hash: { type: 'string' },
														timestamp: { type: 'integer' },
													},
												},
												{
													type: 'object',
													properties: {
														type: { type: 'string', const: 'token' },
														address: { type: 'string' },
														symbol: { type: 'string' },
														name: { type: 'string' },
													},
												},
											],
										},
									},
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							TokenBalances: {
								type: 'object',
								properties: {
									data: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												token: { type: 'string' },
												symbol: { type: 'string', nullable: true },
												name: { type: 'string', nullable: true },
												decimals: { type: 'integer' },
												balance: { type: 'string' },
											},
										},
									},
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							PaginatedTransactions: {
								type: 'object',
								properties: {
									data: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												hash: { type: 'string' },
												blockNumber: { type: 'string' },
												from: { type: 'string' },
												to: { type: 'string', nullable: true },
												value: { type: 'string' },
												gasUsed: { type: 'string' },
												gasPrice: { type: 'string' },
												timestamp: { type: 'integer' },
											},
										},
									},
									pagination: { $ref: '#/components/schemas/Pagination' },
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							PaginatedBalanceChanges: {
								type: 'object',
								properties: {
									data: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												address: { type: 'string' },
												token: { type: 'string' },
												symbol: { type: 'string' },
												decimals: { type: 'integer' },
												balanceBefore: { type: 'string' },
												balanceAfter: { type: 'string' },
												diff: { type: 'string' },
											},
										},
									},
									pagination: { $ref: '#/components/schemas/Pagination' },
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							PaginatedTokens: {
								type: 'object',
								properties: {
									data: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												address: { type: 'string' },
												symbol: { type: 'string' },
												name: { type: 'string' },
												currency: { type: 'string' },
												createdAt: { type: 'integer' },
											},
										},
									},
									pagination: { $ref: '#/components/schemas/Pagination' },
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							PaginatedTransfers: {
								type: 'object',
								properties: {
									data: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												from: { type: 'string' },
												to: { type: 'string' },
												value: { type: 'string' },
												transactionHash: { type: 'string' },
												blockNumber: { type: 'string' },
												logIndex: { type: 'integer' },
												timestamp: { type: 'string', nullable: true },
											},
										},
									},
									pagination: { $ref: '#/components/schemas/Pagination' },
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							PaginatedHolders: {
								type: 'object',
								properties: {
									data: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												address: { type: 'string' },
												balance: { type: 'string' },
											},
										},
									},
									pagination: { $ref: '#/components/schemas/Pagination' },
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
							PaginatedBlocks: {
								type: 'object',
								properties: {
									data: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												number: { type: 'string' },
												hash: { type: 'string' },
												parentHash: { type: 'string' },
												timestamp: { type: 'integer' },
												gasUsed: { type: 'string' },
												gasLimit: { type: 'string' },
												baseFeePerGas: { type: 'string', nullable: true },
												transactionCount: { type: 'integer' },
											},
										},
									},
									pagination: { $ref: '#/components/schemas/Pagination' },
									meta: { $ref: '#/components/schemas/Meta' },
								},
							},
						},
					},
				}

				return Response.json(spec, {
					headers: {
						...CORS_HEADERS,
						'Cache-Control': 'public, max-age=3600',
					},
				})
			},
		},
	},
})
