import { describe, expect, it } from 'vitest'
import { extractRoutes, type Route } from '../scripts/llms/extract.ts'
import { documentRoutes, referenceErrors } from '../scripts/llms/generate.ts'

const routes = extractRoutes()
const documented = documentRoutes(routes)
const references = [...documented.pages, ...documented.api]

function route(path: string): Route {
	const match = routes.find((item) => item.path === path)
	if (!match) throw new Error(`Missing route ${path}`)
	return match
}

describe('route extraction', () => {
	it.each([
		[
			'/address/$address',
			'tab',
			[
				'batches',
				'contract',
				'deposits',
				'fees',
				'holders',
				'holdings',
				'interact',
				'token',
				'transactions',
				'transfers',
				'withdrawals',
			],
		],
		['/address/$address', 'status', ['reverted', 'success']],
		['/address/$address', 'period', ['24h', '7d']],
		['/address/$address', 'dir', ['received', 'sent']],
		[
			'/tx/$hash',
			'tab',
			['balances', 'calls', 'events', 'overview', 'raw', 'trace'],
		],
		['/fee-amm', 'limit', ['10', '25', '50']],
		[
			'/api/address/live/$address',
			'kind',
			['account-transfers', 'token-transfers', 'transactions'],
		],
	])('reads %s %s values from its schema', (path, name, values) => {
		const param = route(path).params.find((item) => item.name === name)
		expect(param?.values).toEqual(values)
	})

	it.each([
		['/address/$address', 'page', '1'],
		['/tx/$hash', 'tab', 'overview'],
		['/policy/$id', 'limit', '10'],
		['/api/address/zone-portal/$address/$kind', 'page', '1'],
	])('reads the %s %s default', (path, name, value) => {
		const param = route(path).params.find((item) => item.name === name)
		expect(param?.default).toBe(value)
	})

	it.each([
		['/api/code', ['GET'], ['address', 'chainid']],
		['/api/simulate', ['POST'], ['chainId', 'data', 'from', 'gas', 'to']],
		['/api/tip20-roles', ['GET'], ['address']],
		['/api/address/live/$address', ['GET'], ['kind']],
		['/api/abi/batch', ['POST'], ['addresses', 'selectors']],
	])('reads %s methods and required params', (path, methods, required) => {
		const { methods: actual, params } = route(path)
		expect(actual).toEqual(methods)
		expect(
			params
				.filter((param) => param.required)
				.map((param) => param.name)
				.sort(),
		).toEqual(required)
	})

	it('types path params parsed by the handler', () => {
		const [address, kind] = route(
			'/api/address/zone-portal/$address/$kind',
		).pathParams
		expect(address?.types).toEqual(['hex'])
		expect(kind?.values).toEqual(['batches', 'deposits', 'withdrawals'])
	})
})

describe('route coverage', () => {
	it('documents every route', () => {
		expect(documented.errors).toEqual([])
	})

	it('fails on an undocumented route', () => {
		const extra = { ...route('/api/health'), path: '/api/unlisted' }
		expect(documentRoutes([...routes, extra]).errors).toEqual([
			'/api/unlisted: undocumented route (src/routes/api/health.ts); add it to scripts/llms/content.ts',
		])
	})

	it('fails on a documented route that no longer exists', () => {
		const remaining = routes.filter((item) => item.path !== '/fee-amm')
		expect(documentRoutes(remaining).errors).toEqual([
			'/fee-amm: documented but no route exists',
		])
	})

	it('fails on undocumented and removed params', () => {
		const tx = route('/tx/$hash')
		const changed = {
			...tx,
			params: [
				...tx.params.filter((param) => param.name !== 'page'),
				{ name: 'cursor', types: ['string'], values: [], required: false },
			],
		}
		expect(
			documentRoutes(routes.map((item) => (item === tx ? changed : item)))
				.errors,
		).toEqual([
			'/tx/{hash}: undocumented parameter `cursor`',
			'/tx/{hash}: documented parameter `page` does not exist',
		])
	})

	it('fails when a tab is added without a description', () => {
		const tx = route('/tx/$hash')
		const tab = tx.params.find((param) => param.name === 'tab')
		if (!tab) throw new Error('Missing tx tab')
		const changed = {
			...tx,
			params: tx.params.map((param) =>
				param === tab ? { ...tab, values: [...tab.values, 'gas'] } : param,
			),
		}
		expect(
			documentRoutes(routes.map((item) => (item === tx ? changed : item)))
				.errors,
		).toEqual([
			'/tx/{hash}: `tab` accepts balances, calls, events, gas, overview, raw, trace, but content lists balances, calls, events, overview, raw, trace',
		])
	})
})

describe('reference checks', () => {
	it.each([
		'`/address/0xabc...?tab=transactions&status=success&period=7d`',
		'`/block/latest`',
		'`/receipt/{hash}.json`',
		'`?status=reverted|success` on `/address/{address}?status=reverted|success`',
		'`GET /api/address/zone-portal/{address}/{kind}?page={number}`',
		'```txt\n/tx/{hash}?tab=raw\n/blocks?live=true\n```',
		'[full reference](/llms-full.txt)',
	])('accepts %s', (text) => {
		expect(referenceErrors(text, references)).toEqual([])
	})

	it.each([
		['`/api/address/total-value/{address}`', 'no documented route matches'],
		['`/api/tokens/count`', 'no documented route matches'],
		['`/demo/tx`', 'no documented route matches'],
		[
			'`/address/{address}?tab=history`',
			'`tab=history` is not one of transactions, transfers, holdings, fees, holders, token, contract, interact, deposits, withdrawals, batches',
		],
		[
			'```txt\n/tx/{hash}?view=raw\n```',
			'`view` is not a documented parameter of /tx/{hash}',
		],
		[
			'`/address/{address}?voucher={json}`',
			'`voucher` is not a documented parameter of /address/{address}',
		],
	])('rejects %s', (text, error) => {
		expect(referenceErrors(text, references)).toEqual([
			expect.stringContaining(error),
		])
	})
})
