/**
 * Generates a fresh Ed25519 signing key and writes .dev.vars for local development.
 * Usage: pnpm keygen [--force]
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const path = join(import.meta.dirname, '..', '.dev.vars')
if (existsSync(path) && !process.argv.includes('--force')) {
	console.error(`${path} already exists; pass --force to overwrite it.`)
	process.exit(1)
}

const { privateKey } = (await crypto.subtle.generateKey(
	{ name: 'Ed25519' },
	true,
	['sign', 'verify'],
)) as CryptoKeyPair
const { kty, crv, d, x } = (await crypto.subtle.exportKey(
	'jwk',
	privateKey,
)) as JsonWebKey

const lines = [
	'# Local development only. Never commit this file.',
	`ATTESTATION_PRIVATE_KEY='${JSON.stringify({ kty, crv, d, x })}'`,
	'ISSUER=http://localhost:8787',
	'EMAIL_FROM=noreply@localhost',
	'# Logs one-time codes to the console. NEVER set this in production.',
	'DEV_LOG_OTP=true',
]
writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o600 })
console.log(`Wrote ${path}`)
