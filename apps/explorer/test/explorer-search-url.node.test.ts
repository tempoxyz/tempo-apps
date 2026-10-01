import { describe, expect, it } from 'vitest'
import { TempoAddress } from 'ox/tempo'
import { parseExplorerSearchUrl } from '#lib/explorer-search-url'
import { normalizeSearchInput } from '#lib/tempo-address'

const address = '0x20C0000000000000000000000000000000000000'
const hash = `0x${'ab'.repeat(32)}`

describe('parseExplorerSearchUrl', () => {
	it.each([
		['explore.tempo.xyz', 'explore.tempo.xyz', 'Mainnet'],
		['explore.mainnet.tempo.xyz', 'explore.tempo.xyz', 'Mainnet'],
		['explore.4217.tempo.xyz', 'explore.tempo.xyz', 'Mainnet'],
		['explore.presto.tempo.xyz', 'explore.tempo.xyz', 'Mainnet'],
		['explore.testnet.tempo.xyz', 'explore.testnet.tempo.xyz', 'Testnet'],
		['explore.42431.tempo.xyz', 'explore.testnet.tempo.xyz', 'Testnet'],
		['explore.moderato.tempo.xyz', 'explore.testnet.tempo.xyz', 'Testnet'],
		['explore.devnet.tempo.xyz', 'explore.devnet.tempo.xyz', 'Devnet'],
		['explore.31318.tempo.xyz', 'explore.devnet.tempo.xyz', 'Devnet'],
		[
			'explore.nextfork.devnet.tempo.xyz',
			'explore.nextfork.devnet.tempo.xyz',
			'Nextfork',
		],
		[
			'explore.zone-prover.devnet.tempo.xyz',
			'explore.zone-prover.devnet.tempo.xyz',
			'Zone Prover',
		],
	])('preserves the network for %s', (host, canonicalHost, network) => {
		expect(parseExplorerSearchUrl(`https://${host}/block/100`)).toEqual({
			href: `https://${canonicalHost}/block/100`,
			network,
		})
	})

	it.each([
		'address',
		'token',
	])('opens a %s resource without changing its type', (resource) => {
		expect(
			parseExplorerSearchUrl(
				`https://explore.tempo.xyz/${resource}/${address}`,
			),
		).toEqual({
			href: `https://explore.tempo.xyz/${resource}/${address}`,
			network: 'Mainnet',
		})
	})
	it.each(['tx', 'receipt'])('opens a %s hash', (resource) => {
		expect(
			parseExplorerSearchUrl(`https://explore.tempo.xyz/${resource}/${hash}`),
		).toEqual({
			href: `https://explore.tempo.xyz/${resource}/${hash}`,
			network: 'Mainnet',
		})
	})
	it('normalizes Tempo addresses using the existing address rules', () => {
		expect(
			parseExplorerSearchUrl(
				`https://explore.tempo.xyz/address/${TempoAddress.format(address)}`,
			),
		).toEqual({
			href: `https://explore.tempo.xyz/address/${address}`,
			network: 'Mainnet',
		})
	})
	it.each(['latest', hash])('preserves block identifier %s', (id) => {
		expect(
			parseExplorerSearchUrl(`https://explore.tempo.xyz/block/${id}`),
		).toEqual({
			href: `https://explore.tempo.xyz/block/${id}`,
			network: 'Mainnet',
		})
	})
	it('preserves a block hash through a network alias', () => {
		expect(
			parseExplorerSearchUrl(`https://explore.42431.tempo.xyz/block/${hash}`),
		).toEqual({
			href: `https://explore.testnet.tempo.xyz/block/${hash}`,
			network: 'Testnet',
		})
	})
	it('trims pasted whitespace, normalizes host case and block number, drops view options', () => {
		expect(
			parseExplorerSearchUrl(
				'  https://EXPLORE.TEMPO.XYZ/block/000100/?tab=foo#bar  ',
			),
		).toEqual({
			href: 'https://explore.tempo.xyz/block/100',
			network: 'Mainnet',
		})
	})
	it.each([
		'0',
		'9007199254740991',
	])('supports safe block boundary %s', (id) => {
		expect(
			parseExplorerSearchUrl(`https://explore.tempo.xyz/block/${id}`),
		).toEqual({
			href: `https://explore.tempo.xyz/block/${id}`,
			network: 'Mainnet',
		})
	})
	it.each([
		'http://explore.tempo.xyz/block/1',
		'javascript:alert(1)',
		'//explore.tempo.xyz/block/1',
		'https://explore.tempo.xyz.evil.example/block/1',
		'https://evil.example/explore.tempo.xyz/block/1',
		'https://explore.tempo.xyz@evil.example/block/1',
		'https://evil.example@explore.tempo.xyz/block/1',
		'https://user:pass@explore.tempo.xyz/block/1',
		'https://explore.tempo.xyz:8443/block/1',
		'https://explore.tempo.xyz./block/1',
		'https://explorer-mainnet.evil.example/block/1',
		'https://explore.tempo.xyz/blocks',
		'https://explore.tempo.xyz/block/9007199254740992',
		'https://explore.tempo.xyz/block/-1',
		'https://explore.tempo.xyz/block/latestish',
		'https://explore.tempo.xyz/block/0x00',
		`https://explore.tempo.xyz/block/0x${'ab'.repeat(33)}`,
		`https://explore.tempo.xyz/block/0x${'zz'.repeat(32)}`,
		'https://explore.tempo.xyz/block/1.5',
		'https://explore.tempo.xyz/block/1e2',
		'https://explore.tempo.xyz/block/1/extra',
		'https://explore.tempo.xyz/block/%2F1',
		'https://explore.tempo.xyz/block/%E0%A4%A',
		'https://explore.tempo.xyz/tx/0x00',
		`https://explore.tempo.xyz/tx/0x${'zz'.repeat(32)}`,
		'https://explore.tempo.xyz/token/invalid',
		'https://explore.tempo.xyz/address/0x00',
		'https://explore.tempo.xyz/policy/1',
		'',
		'not a URL',
		'#100',
		'100',
		'pathUSD',
	])('rejects unsupported input %s without throwing', (input) => {
		expect(parseExplorerSearchUrl(input)).toBeUndefined()
		// A valid counterpart guards against a parser that rejects everything.
		expect(parseExplorerSearchUrl('https://explore.tempo.xyz/block/1')).toEqual(
			{ href: 'https://explore.tempo.xyz/block/1', network: 'Mainnet' },
		)
	})
	it.each([
		'tx',
		'receipt',
		'block',
	])('rejects odd-length %s hashes', (resource) => {
		expect(
			parseExplorerSearchUrl(
				`https://explore.tempo.xyz/${resource}/0x${'ab'.repeat(31)}a`,
			),
		).toBeUndefined()
		expect(
			parseExplorerSearchUrl(`https://explore.tempo.xyz/${resource}/${hash}`),
		).toEqual({
			href: `https://explore.tempo.xyz/${resource}/${hash}`,
			network: 'Mainnet',
		})
	})
	it('leaves raw normalization independent of URL parsing', () => {
		expect(normalizeSearchInput(` ${address} `)).toBe(address)
		expect(normalizeSearchInput(' pathUSD ')).toBe('pathUSD')
		expect(normalizeSearchInput(' #100 ')).toBe('#100')
		expect(normalizeSearchInput(hash)).toBe(hash)
	})
})
