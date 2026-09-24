import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import explorerConfig from '../../vite.config'

// Opt-in browser harness: exercise the real server functions and UI against
// deterministic API/indexer/RPC responses without a production API key.
export default defineConfig(async (env) => {
	const config =
		typeof explorerConfig === 'function'
			? await explorerConfig(env)
			: explorerConfig
	const serverEnv = fileURLToPath(
		new URL('../../src/lib/server/env.ts', import.meta.url),
	)
	const wagmiConfig = fileURLToPath(
		new URL('../../src/wagmi.config.ts', import.meta.url),
	)
	return mergeConfig(config, {
		cacheDir: 'node_modules/.vite-fee-amm',
		plugins: [
			{
				name: 'fee-amm-browser-fixtures',
				enforce: 'pre',
				transform(code: string, id: string) {
					const file = id.split('?')[0]
					if (file === serverEnv)
						return code.replace(
							"'https://api.tempo.xyz'",
							"'http://localhost:4018'",
						)
					if (file === wagmiConfig)
						return code.replace(
							"const target = getChainBackend(chain.id, 'rpc')",
							"return http('http://localhost:4018/rpc', { batch: true })\n\t\tconst target = getChainBackend(chain.id, 'rpc')",
						)
				},
			},
		],
	})
})
