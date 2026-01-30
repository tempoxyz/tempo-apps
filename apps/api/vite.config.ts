import NodeProcess from 'node:process'
import { defineConfig, loadEnv} from 'vite'
import NodeChildProcess from 'node:child_process'
import { cloudflare } from '@cloudflare/vite-plugin'

const commitSha =
	NodeChildProcess.execSync('git rev-parse --short HEAD').toString().trim() ||
	NodeProcess.env.CF_PAGES_COMMIT_SHA?.slice(0, 7)

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	return {
		plugins: [cloudflare()],
		define: {
			__BUILD_VERSION__: JSON.stringify(commitSha ?? Date.now().toString()),
		},
		server: {
			port: Number(env.PORT ?? 3_000),
			allowedHosts: config.mode === 'development' ? true : undefined,
		},
	}
})
