import { describe, expect, it } from 'vitest'
import {
	buildExplorerNetworkHref,
	EXPLORER_NETWORK_OPTIONS,
	isExplorerNetworkPathPreservable,
} from '#lib/explorer-network.ts'

const MAINNET_HOST = 'https://explore.tempo.xyz'
const TESTNET_HOST = 'https://explore.testnet.tempo.xyz'

const SAMPLE_HASH =
	'0x0000000000000000000000000000000000000000000000000000000000000000'
const SAMPLE_ADDRESS = '0x20c0000000000000000000000000000000000000'

describe('explorer network switcher hrefs', () => {
	it('uses the canonical mainnet and testnet explorer hosts', () => {
		expect(EXPLORER_NETWORK_OPTIONS).toEqual([
			expect.objectContaining({ env: 'mainnet', host: MAINNET_HOST }),
			expect.objectContaining({ env: 'testnet', host: TESTNET_HOST }),
		])
	})

	it.each([
		['transaction', `/tx/${SAMPLE_HASH}`],
		['receipt', `/receipt/${SAMPLE_HASH}`],
		['block', '/block/123456?page=2'],
		['address', `/address/${SAMPLE_ADDRESS}?tab=tokens&page=3`],
		['token compatibility route', `/token/${SAMPLE_ADDRESS}?tab=holders`],
		['fee amm route with hash', '/fee-amm#pools'],
	])('preserves the %s resource path when switching networks', (_, path) => {
		expect(buildExplorerNetworkHref(MAINNET_HOST, path)).toBe(
			`${MAINNET_HOST}${path}`,
		)
		expect(buildExplorerNetworkHref(TESTNET_HOST, path)).toBe(
			`${TESTNET_HOST}${path}`,
		)
	})

	it('normalizes a path without a leading slash', () => {
		expect(buildExplorerNetworkHref(TESTNET_HOST, 'blocks')).toBe(
			`${TESTNET_HOST}/blocks`,
		)
	})

	it('preserves resource paths even when the current route rendered not found', () => {
		expect(isExplorerNetworkPathPreservable(`/receipt/${SAMPLE_HASH}`)).toBe(
			true,
		)
		expect(
			isExplorerNetworkPathPreservable(`/tx/${SAMPLE_HASH}?tab=logs#top`),
		).toBe(true)
		expect(
			buildExplorerNetworkHref(TESTNET_HOST, `/receipt/${SAMPLE_HASH}`),
		).toBe(`${TESTNET_HOST}/receipt/${SAMPLE_HASH}`)
		expect(
			buildExplorerNetworkHref(MAINNET_HOST, `/tx/${SAMPLE_HASH}?tab=logs#top`),
		).toBe(`${MAINNET_HOST}/tx/${SAMPLE_HASH}?tab=logs#top`)
	})

	it('still links unknown not-found routes to the target network homepage', () => {
		expect(isExplorerNetworkPathPreservable('/definitely-not-a-route')).toBe(
			false,
		)
		expect(
			buildExplorerNetworkHref(TESTNET_HOST, '/definitely-not-a-route', {
				fallbackToHome: true,
			}),
		).toBe(`${TESTNET_HOST}/`)
	})
})
