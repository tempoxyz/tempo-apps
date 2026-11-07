/**
 * Generates a fresh Ed25519 signing key.
 * Usage: pnpm keygen [--force]   writes .dev.vars for local development
 *        pnpm keygen --print      prints only the private JWK, for production:
 *          pnpm --silent keygen --print | wrangler secret put ATTESTATION_PRIVATE_KEY
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const print = process.argv.includes('--print')
const path = join(import.meta.dirname, '..', '.dev.vars')
if (!print && existsSync(path) && !process.argv.includes('--force')) {
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

if (print) {
	// Piped straight into the secret store, so it never touches the disk.
	process.stdout.write(JSON.stringify({ kty, crv, d, x }))
	process.exit(0)
}

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
