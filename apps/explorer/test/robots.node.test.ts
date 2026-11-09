import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const robots = readFileSync(
	new URL('../public/robots.txt', import.meta.url),
	'utf8',
)
const rules = robots.split('\n').flatMap((line) => {
	const [, directive, pattern] = /^(Allow|Disallow):\s*(\S+)/.exec(line) ?? []
	return pattern ? [{ allow: directive === 'Allow', pattern }] : []
})

// This file has one wildcard user-agent group. Apply Google's longest matching
// rule precedence (Allow wins ties), including the '*' and '$' pattern syntax.
function isAllowed(path: string) {
	const matches = rules.filter(({ pattern }) => {
		const exact = pattern.endsWith('$')
		const prefix = exact ? pattern.slice(0, -1) : pattern
		const expression = prefix
			.split('*')
			.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('.*')
		return new RegExp(`^${expression}${exact ? '$' : ''}`).test(path)
	})
	matches.sort(
		(a, b) =>
			b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow),
	)
	return matches[0]?.allow ?? true
}

const token = '/token/0x8004a169fb4a3325136eb29fa0ceb6d2e539a432'

describe('Explorer robots query exclusions', () => {
	it.each([
		'444',
		'505',
		'527',
		'622',
	])('disallows the GSC token URL with a=%s', (value) =>
		expect(isAllowed(`${token}?a=${value}`)).toBe(false))

	it.each([
		'?a=444&page=2',
		'?page=2&a=444',
		'?page=2&a=444&limit=10',
		'?page=2&limit=10&a=444',
		'?a=0x0000000000000000000000000000000000000000',
		'?a=',
		'?page=2&a=',
	])('disallows account filters in query order %s', (query) => {
		expect(isAllowed(`${token}${query}`)).toBe(false)
	})

	it.each([
		'',
		'?page=2',
		'?tab=holders',
		'?data=444',
		'?page=2&data=444',
	])('keeps clean token URLs and unrelated queries crawlable: %s', (query) =>
		expect(isAllowed(`${token}${query}`)).toBe(true))

	it.each([
		'/',
		'/tokens',
		'/tokens?page=2',
	])('preserves crawl access to %s', (path) =>
		expect(isAllowed(path)).toBe(true))

	it.each([
		'/address/0x123',
		'/block/1',
		'/blocks',
		'/tx/0x123',
		'/receipt/0x123',
		'/demo/',
	])('preserves the existing exclusion for %s', (path) =>
		expect(isAllowed(path)).toBe(false))
})
