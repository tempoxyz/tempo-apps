import { createFileTreeIconResolver } from '@pierre/trees'
import { describe, expect, it } from 'vitest'
import { contractSourceIcons } from '#lib/contract-source-icons'
import { longestLineColumns } from '#lib/domain/contract-source'

describe('contract source icons', () => {
	const { resolveIcon } = createFileTreeIconResolver(contractSourceIcons)
	const icon = (path: string) => resolveIcon('file-tree-icon-file', path).name

	it('maps contract languages to custom icons', () => {
		expect(['src/Token.sol', 'contracts/vault.vy'].map(icon)).toEqual([
			'contract-source-icon-solidity',
			'contract-source-icon-vyper',
		])
	})

	it('keeps built-in icons for other files', () => {
		expect(['src/lib.rs', 'metadata.json'].map(icon)).toEqual([
			'file-tree-builtin-rust',
			'file-tree-builtin-json',
		])
	})

	it('defines every mapped symbol', () => {
		for (const extension of Object.keys(
			contractSourceIcons.byFileExtension ?? {},
		))
			expect(contractSourceIcons.spriteSheet).toContain(
				`id="${icon(`file.${extension}`)}"`,
			)
	})
})

describe('longestLineColumns', () => {
	it('measures the widest line', () => {
		expect(longestLineColumns('a\nabcdef\nabc')).toBe(6)
		expect(longestLineColumns('')).toBe(0)
	})

	it('expands tabs to the next tab stop', () => {
		expect(longestLineColumns('\tx')).toBe(3)
		expect(longestLineColumns('a\tx')).toBe(3)
		expect(longestLineColumns('\t\tx', 4)).toBe(9)
	})

	it('counts astral characters once', () => {
		expect(longestLineColumns('// 🦀')).toBe(4)
	})
})
