import { describe, expect, it } from 'vitest'
import { resolveLogoURI } from '#lib/domain/tip20'

describe('TIP-20 logoURI helpers', () => {
	it('returns undefined for empty logo URIs', () => {
		expect(resolveLogoURI(undefined)).toBeUndefined()
		expect(resolveLogoURI('')).toBeUndefined()
		expect(resolveLogoURI('   ')).toBeUndefined()
	})

	it('passes through browser-native image URI schemes', () => {
		expect(resolveLogoURI('https://example.com/logo.png')).toBe(
			'https://example.com/logo.png',
		)
		expect(resolveLogoURI('data:image/png;base64,abc')).toBe(
			'data:image/png;base64,abc',
		)
	})

	it('normalizes IPFS URIs to an HTTP gateway URL', () => {
		expect(resolveLogoURI('ipfs://bafybeigdyr/logo.png')).toBe(
			'https://ipfs.io/ipfs/bafybeigdyr/logo.png',
		)
		expect(resolveLogoURI('ipfs://ipfs/bafybeigdyr/logo.png')).toBe(
			'https://ipfs.io/ipfs/bafybeigdyr/logo.png',
		)
	})
})
