import { describe, expect, it } from 'vitest'
import { cleanSolcVersion } from '../../container/compiler.ts'

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
