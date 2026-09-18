import { createServer } from 'node:http'
import {
	decodeFunctionData,
	decodeAbiParameters,
	deploylessCallViaBytecodeBytecode,
	encodeFunctionResult,
	encodeAbiParameters,
	keccak256,
	pad,
	multicall3Abi,
} from 'viem'
import { Addresses } from 'viem/tempo'
import { Abis } from '#lib/abis'

const OUSD = '0x20c0000000000000000000006a37da5c996874be'
const PATH = Addresses.pathUsd
const tokens = Array.from({ length: 12 }, (_, i) => ({
	address: (i === 10
		? OUSD
		: `0x20c${(i + 1).toString(16).padStart(37, '0')}`) as `0x${string}`,
	currency: 'USD',
	decimals: 6,
	name: i === 10 ? 'OpenUSD' : `Example Dollar ${i + 1}`,
	symbol: i === 10 ? 'OUSD' : `USD${i + 1}`,
}))
const pathToken = {
	address: PATH as `0x${string}`,
	currency: 'USD',
	decimals: 6,
	name: 'pathUSD',
	symbol: 'pathUSD',
}
const pools = tokens.map((token, i) => ({
	id: keccak256(
		encodeAbiParameters(
			[{ type: 'address' }, { type: 'address' }],
			[token.address, PATH],
		),
	),
	poolId: keccak256(
		encodeAbiParameters(
			[{ type: 'address' }, { type: 'address' }],
			[token.address, PATH],
		),
	),
	userToken: token,
	validatorToken: pathToken,
	createdAt: '2026-09-01T12:00:00.000Z',
	lastMintAt: '2026-09-18T12:00:00.000Z',
	mintCount: 12 - i,
	userAmount: {
		baseUnits: '24',
		formatted: '0.000024',
		decimals: 6,
		currency: 'USD',
	},
	validatorAmount: {
		baseUnits: '49999977',
		formatted: '49.999977',
		decimals: 6,
		currency: 'USD',
	},
}))
let failed = false
let missingReserves = false
const requests: string[] = []

function call(to: string = PATH, data: `0x${string}`): `0x${string}` {
	const abi = [...multicall3Abi, ...Abis.feeAmm, ...Abis.tip20]
	try {
		if (data.startsWith(deploylessCallViaBytecodeBytecode)) {
			const [, calldata] = decodeAbiParameters(
				[{ type: 'bytes' }, { type: 'bytes' }],
				`0x${data.slice(deploylessCallViaBytecodeBytecode.length)}`,
			)
			return call(to, calldata)
		}
		const decoded = decodeFunctionData({ abi, data })
		const token =
			tokens.find(
				(token) => token.address.toLowerCase() === to.toLowerCase(),
			) ?? pathToken
		let result: unknown
		switch (decoded.functionName) {
			case 'aggregate3':
				result = (
					decoded.args[0] as readonly {
						target: string
						callData: `0x${string}`
					}[]
				).map((item) => ({
					success: true,
					returnData: call(item.target, item.callData),
				}))
				break
			case 'getPool':
				result = { reserveUserToken: 24n, reserveValidatorToken: 49999977n }
				break
			case 'name':
				result = token.name
				break
			case 'symbol':
				result = token.symbol
				break
			case 'currency':
				result = 'USD'
				break
			case 'decimals':
				result = 6
				break
			case 'paused':
			case 'hasRole':
				result = false
				break
			case 'quoteToken':
			case 'nextQuoteToken':
				result = PATH
				break
			case 'logoURI':
				result = ''
				break
			default:
				result = 0n
		}
		return encodeFunctionResult({
			abi,
			functionName: decoded.functionName,
			result,
		} as never)
	} catch {
		return `0x${'0'.repeat(64)}`
	}
}

createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost:4018')
	res.setHeader('content-type', 'application/json')
	res.setHeader('access-control-allow-origin', '*')
	if (url.pathname === '/control') {
		failed = url.searchParams.get('failed') === 'true'
		missingReserves = url.searchParams.get('missingReserves') === 'true'
		res.end(JSON.stringify({ failed, missingReserves }))
		return
	}
	if (url.pathname === '/requests') {
		res.end(JSON.stringify(requests))
		return
	}
	requests.push(url.pathname + url.search)
	if (/^\/v1\/tokens\/0x[0-9a-f]+\/logo$/.test(url.pathname)) {
		// Missing curated logos are 404s, never successful JSON image responses.
		res.statusCode = 404
		res.end()
		return
	}
	if (url.pathname === '/rpc') {
		let body = ''
		for await (const chunk of req) body += chunk
		type RpcRequest = {
			id: number
			method: string
			params?: [{ to: string; data: `0x${string}` }]
		}
		const payload = JSON.parse(body) as RpcRequest | RpcRequest[]
		const rpc = (entry: RpcRequest) => {
			if (
				missingReserves &&
				entry.method === 'eth_call' &&
				entry.params?.[0]?.data.startsWith('0x531aa03e')
			)
				return {
					id: entry.id,
					jsonrpc: '2.0',
					error: { code: -32000, message: 'Reserve read unavailable' },
				}
			return {
				id: entry.id,
				jsonrpc: '2.0',
				result:
					entry.method === 'eth_chainId'
						? '0x1079'
						: entry.method === 'eth_blockNumber'
							? '0x123456'
							: entry.method === 'eth_getCode'
								? '0x01'
								: entry.method === 'eth_call' && entry.params?.[0]
									? call(entry.params[0].to, entry.params[0].data)
									: '0x0',
			}
		}
		res.end(
			JSON.stringify(Array.isArray(payload) ? payload.map(rpc) : rpc(payload)),
		)
		return
	}
	if (failed) {
		res.statusCode = 503
		res.end(JSON.stringify({ error: 'Fixture upstream unavailable' }))
		return
	}
	if (url.pathname === '/v1/fee-amm/pools') {
		const limit = Number(url.searchParams.get('limit') ?? 10)
		const page = Number(url.searchParams.get('page') ?? 1)
		res.end(
			JSON.stringify({
				data: pools.slice((page - 1) * limit, page * limit),
				nextCursor: page * limit < pools.length ? 'next' : null,
			}),
		)
		return
	}
	if (url.pathname.includes('/query')) {
		const sql =
			url.searchParams.get('sql') ?? url.searchParams.get('query') ?? ''
		const matching = pools.filter(
			(pool) =>
				sql.toLowerCase().includes(pad(pool.userToken.address).toLowerCase()) ||
				sql.toLowerCase().includes(pad(PATH).toLowerCase()),
		)
		const limit = Number(sql.match(/limit (\d+)/i)?.[1] ?? 11)
		const offset = Number(sql.match(/offset (\d+)/i)?.[1] ?? 0)
		const rows = matching
			.slice(offset, offset + limit)
			.map((pool) => [
				pad(pool.userToken.address),
				pad(pool.validatorToken.address),
				pool.mintCount,
				pool.createdAt,
				pool.lastMintAt,
			])
		res.end(
			JSON.stringify({
				ok: true,
				columns: ['topic2', 'topic3', 'mintCount', 'createdAt', 'lastMintAt'],
				rows,
				row_count: rows.length,
			}),
		)
		return
	}
	res.end(JSON.stringify({ data: [], nextCursor: null }))
}).listen(4018, '::', () =>
	process.stdout.write('Fee AMM fixtures listening on 4018\n'),
)
