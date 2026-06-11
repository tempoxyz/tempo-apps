import 'dotenv/config'
import { join } from 'node:path'
import { Mnemonic } from 'ox'
import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

import wranglerJSON from '#wrangler.json' with { type: 'json' }
import { accountsAliases } from './config/accounts-aliases.js'

const tempoEnv = (() => {
	const raw = process.env.TEMPO_ENV
	if (raw === 'testnet') return 'moderato'
	if (raw) return raw
	if (process.env.TEMPO_RPC_URL) return 'moderato'
	return 'localnet'
})()

const testMnemonic =
	'test test test test test test test test test test test junk'
const sponsorPrivateKey = Mnemonic.toPrivateKey(testMnemonic, {
	as: 'Hex',
	path: Mnemonic.path({ account: 0 }),
})

const rpcUrl = (() => {
	if (process.env.TEMPO_RPC_URL) return process.env.TEMPO_RPC_URL
	if (tempoEnv === 'mainnet') return 'https://rpc.mainnet.tempo.xyz'
	if (tempoEnv === 'moderato') return 'https://rpc.moderato.tempo.xyz'
	if (tempoEnv === 'devnet') return 'https://rpc.devnet.tempoxyz.dev'
	const poolId = Number(process.env.VITEST_POOL_ID ?? 1)
	return `http://localhost:9655/${poolId}`
})()

export default defineConfig({
	resolve: {
		alias: accountsAliases(),
		tsconfigPaths: true,
	},
	test: {
		testTimeout: 60_000,
		include: ['test/**/*.test.ts'],
		globalSetup: [join(import.meta.dirname, './test/setup.global.ts')],
	},
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: './wrangler.json',
			},
			miniflare: {
				compatibilityFlags: [
					...wranglerJSON.compatibility_flags,
					'enable_nodejs_fs_module',
					'enable_nodejs_v8_module',
					'enable_nodejs_tty_module',
					'enable_nodejs_process_v2',
					'enable_nodejs_http_modules',
					'enable_nodejs_perf_hooks_module',
				],
				bindings: {
					ALLOWED_ORIGINS: '*',
					SPONSOR_NAME: 'Tempo Multisig Relay Test',
					SPONSOR_PRIVATE_KEY: sponsorPrivateKey,
					SPONSOR_URL: 'https://native-multisig-relay.test',
					TEMPO_ENV: tempoEnv,
					TEMPO_RPC_URL: rpcUrl,
				},
				kvNamespaces: ['MultisigOperationStore'],
			},
		}),
	],
})
