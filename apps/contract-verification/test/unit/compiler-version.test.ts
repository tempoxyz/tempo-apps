import { describe, expect, it } from 'vitest'
import {
	cleanSolcVersion,
	parseSolarVersion,
	resolveSolarBuild,
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

	it('returns null for solc versions', () => {
		expect(parseSolarVersion('0.8.36+commit.1835d247')).toBeNull()
		expect(parseSolarVersion('0.8.26')).toBeNull()
		expect(parseSolarVersion('0.2.0')).toBeNull()
	})
})

describe('resolveSolarBuild', () => {
	const builds = [
		{ rev: 'd83529bcb2f8a911607e43ba4bb2e316d9ac78a4', version: '0.2.0' },
		{ rev: 'a1f81d071a85b2f6c36cd67fb2fd9d4503477169', version: '0.2.0' },
	]

	it('resolves an abbreviated commit to its pinned full revision', () => {
		expect(
			resolveSolarBuild('0.8.36+commit.d83529b.solar.0.2.0', builds),
		).toMatchObject({
			rev: 'd83529bcb2f8a911607e43ba4bb2e316d9ac78a4',
			solcVersion: '0.8.36',
		})
	})

	it('pins the build Earn uses', () => {
		expect(resolveSolarBuild('0.8.36+commit.d83529b.solar.0.2.0').rev).toBe(
			'd83529bcb2f8a911607e43ba4bb2e316d9ac78a4',
		)
	})

	it('rejects a commit that is not pinned', () => {
		expect(() =>
			resolveSolarBuild('0.8.36+commit.0123456.solar.0.2.0', builds),
		).toThrow('Unsupported solar build 0123456 (0.2.0)')
	})

	it('rejects a pinned commit reporting another solar version', () => {
		expect(() =>
			resolveSolarBuild('0.8.36+commit.d83529b.solar.0.1.8', builds),
		).toThrow('Unsupported solar build')
	})

	it('rejects solc versions', () => {
		expect(() => resolveSolarBuild('0.8.36+commit.1835d247', builds)).toThrow(
			'Not a solar compilerVersion',
		)
	})
})
