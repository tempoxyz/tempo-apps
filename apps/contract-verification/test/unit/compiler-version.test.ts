import { describe, expect, it } from 'vitest'
import {
	cleanSolcVersion,
	parseSolarVersion,
	findDownloadableSolarBuild,
	findPinnedSolarBuild,
} from '../../container/compiler.ts'

describe('cleanSolcVersion', () => {
	it('accepts version without prefix', () => {
		expect(cleanSolcVersion('0.8.19+commit.7dd6d404')).toBe(
			'0.8.19+commit.7dd6d404',
		)
	})

	it('strips v prefix', () => {
		expect(cleanSolcVersion('v0.8.19+commit.7dd6d404')).toBe(
			'0.8.19+commit.7dd6d404',
		)
	})

	it('accepts version without commit hash', () => {
		expect(cleanSolcVersion('0.8.26')).toBe('0.8.26')
	})

	it('strips v prefix from version without commit hash', () => {
		expect(cleanSolcVersion('v0.8.26')).toBe('0.8.26')
	})

	it('throws on invalid version', () => {
		expect(() => cleanSolcVersion('invalid')).toThrow(
			'Unsupported compilerVersion',
		)
	})
})

describe('parseSolarVersion', () => {
	it('parses the version solar reports as a solc wrapper', () => {
		expect(parseSolarVersion('0.8.36+commit.d83529b.solar.0.2.0')).toEqual({
			solcVersion: '0.8.36',
			commit: 'd83529b',
			solarVersion: '0.2.0',
		})
	})

	it('parses releases and the development build Foundry bundles', () => {
		expect(parseSolarVersion('0.8.38+commit.e7a91fc7.solar.0.3.0')).toEqual({
			solcVersion: '0.8.38',
			commit: 'e7a91fc7',
			solarVersion: '0.3.0',
		})
		expect(parseSolarVersion('0.8.38+commit.a2b44354.solar.0.3.0-dev')).toEqual(
			{
				solcVersion: '0.8.38',
				commit: 'a2b44354',
				solarVersion: '0.3.0-dev',
			},
		)
	})

	it('returns null for solc versions', () => {
		expect(parseSolarVersion('0.8.36+commit.1835d247')).toBeNull()
		expect(parseSolarVersion('0.8.26')).toBeNull()
		expect(parseSolarVersion('0.2.0')).toBeNull()
	})
})

describe('findPinnedSolarBuild', () => {
	const builds = [
		{ rev: 'd83529bcb2f8a911607e43ba4bb2e316d9ac78a4', version: '0.2.0' },
		{ rev: 'a1f81d071a85b2f6c36cd67fb2fd9d4503477169', version: '0.2.0' },
	]

	it('resolves an abbreviated commit to its pinned full revision', () => {
		expect(
			findPinnedSolarBuild('0.8.36+commit.d83529b.solar.0.2.0', builds),
		).toMatchObject({
			rev: 'd83529bcb2f8a911607e43ba4bb2e316d9ac78a4',
			solcVersion: '0.8.36',
		})
	})

	it('pins the build Earn uses', () => {
		expect(findPinnedSolarBuild('0.8.36+commit.d83529b.solar.0.2.0')?.rev).toBe(
			'd83529bcb2f8a911607e43ba4bb2e316d9ac78a4',
		)
	})

	it('leaves releases and other commits to be downloaded', () => {
		expect(
			findPinnedSolarBuild('0.8.36+commit.0123456.solar.0.2.0', builds),
		).toBeNull()
		expect(
			findPinnedSolarBuild('0.8.38+commit.e7a91fc7.solar.0.3.0', builds),
		).toBeNull()
		expect(
			findPinnedSolarBuild('0.8.38+commit.a2b44354.solar.0.3.0-dev', builds),
		).toBeNull()
	})

	it('does not use a pinned commit for another solar version', () => {
		expect(
			findPinnedSolarBuild('0.8.36+commit.d83529b.solar.0.1.8', builds),
		).toBeNull()
	})

	it('rejects solc versions', () => {
		expect(() =>
			findPinnedSolarBuild('0.8.36+commit.1835d247', builds),
		).toThrow('Not a solar compilerVersion')
	})
})

describe('findDownloadableSolarBuild', () => {
	it('finds the solar 0.3.0 release and the build Foundry bundles', () => {
		expect(
			findDownloadableSolarBuild('0.8.38+commit.e7a91fc7.solar.0.3.0')?.rev,
		).toBe('e7a91fc70f29dc8d0c236d56a2aa7706dc2555cf')
		expect(
			findDownloadableSolarBuild('0.8.38+commit.a2b44354.solar.0.3.0-dev')
				?.sha256,
		).toMatch(/^[0-9a-f]{64}$/)
	})

	it('accepts a full 40-character commit', () => {
		expect(
			findDownloadableSolarBuild(
				'0.8.38+commit.e7a91fc70f29dc8d0c236d56a2aa7706dc2555cf.solar.0.3.0',
			)?.version,
		).toBe('0.3.0')
	})

	it('refuses builds without a pinned checksum', () => {
		expect(
			findDownloadableSolarBuild('0.8.38+commit.deadbeef.solar.0.3.0'),
		).toBeNull()
		expect(
			findDownloadableSolarBuild('0.8.38+commit.e7a91fc7.solar.0.3.1'),
		).toBeNull()
	})
})
