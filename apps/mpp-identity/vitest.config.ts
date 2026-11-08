import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const { privateKey } = (await crypto.subtle.generateKey(
	{ name: 'Ed25519' },
	true,
	['sign', 'verify'],
)) as CryptoKeyPair
const { kty, crv, d, x } = (await crypto.subtle.exportKey(
	'jwk',
	privateKey,
)) as JsonWebKey

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		include: ['test/**/*.test.ts'],
	},
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.json' },
			miniflare: {
				bindings: {
					ISSUER: 'https://identity.test',
					EMAIL_FROM: 'noreply@identity.test',
					ATTESTATION_TTL: '3600',
					ATTESTATION_PRIVATE_KEY: JSON.stringify({ kty, crv, d, x }),
					DEV_LOG_OTP: 'false',
				},
			},
		}),
	],
})
