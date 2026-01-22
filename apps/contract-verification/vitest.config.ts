import 'dotenv/config'
import { loadEnv } from 'vite'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

// VITEST_ENV controls which chain to test against: devnet | testnet | mainnet
const vitestEnv = process.env.VITEST_ENV ?? 'devnet'

const chainConfig = {
	devnet: { chainId: 31318, name: 'Tempo Devnet' },
	testnet: { chainId: 42431, name: 'Tempo Moderato' },
	mainnet: { chainId: 4217, name: 'Tempo Mainnet' },
} as const

const selectedChain = chainConfig[vitestEnv]
if (!selectedChain)
	throw new Error(
		`Invalid VITEST_ENV="${vitestEnv}". Must be: devnet | testnet | mainnet`,
	)

// ast-grep-ignore: no-console-log
console.log(
	// ast-grep-ignore: no-leading-whitespace-strings
	`\nTesting against ${selectedChain.name} (${selectedChain.chainId})\n`,
)

export default defineWorkersConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	return {
		test: {
			env: { ...env },
			setupFiles: ['./test/setup.ts'],
			globalSetup: ['./test/global-setup.ts'],
			poolOptions: {
				workers: {
					isolatedStorage: true,
					wrangler: { configPath: './wrangler.jsonc' },
					miniflare: {
						compatibilityDate: '2026-01-20',
						compatibilityFlags: [
							'nodejs_compat',
							'enable_nodejs_tty_module',
							'enable_nodejs_fs_module',
							'enable_nodejs_http_modules',
							'enable_nodejs_perf_hooks_module',
						],
						bindings: {
							TEST_CHAIN_ID: selectedChain.chainId,
							TEST_CHAIN_NAME: selectedChain.name,
							VITEST_ENV: vitestEnv,
						},
					},
				},
			},
		},
	}
})
