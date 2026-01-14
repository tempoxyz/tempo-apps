import { cloudflare } from '@cloudflare/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { parse } from 'jsonc-parser'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const [, , , ...args] = process.argv

function getWranglerEnvVars(
	envName: string | undefined,
): Record<string, string> {
	if (!envName) return {}
	try {
		const content = readFileSync('wrangler.jsonc', 'utf-8')
		const wranglerConfig = parse(content) as {
			env?: Record<string, { vars?: Record<string, string> }>
		}
		return wranglerConfig?.env?.[envName]?.vars ?? {}
	} catch {
		return {}
	}
}

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')

	const cloudflareEnv = process.env.CLOUDFLARE_ENV || env.CLOUDFLARE_ENV
	const wranglerVars = getWranglerEnvVars(cloudflareEnv)

	const showDevtools = env.VITE_ENABLE_DEVTOOLS !== 'false'

	const lastPort = (() => {
		const index = args.lastIndexOf('--port')
		return index === -1 ? null : (args.at(index + 1) ?? null)
	})()
	const port = Number(lastPort ?? env.PORT ?? 3_001)

	const allowedHosts = env.ALLOWED_HOSTS?.split(',') ?? []

	return {
		plugins: [
			vitePluginAlias(),
			showDevtools && devtools(),
			cloudflare({ viteEnvironment: { name: 'ssr' } }),
			tailwind(),
			Icons({ compiler: 'jsx', jsx: 'react' }),
			tanstack({
				srcDirectory: './src',
				start: { entry: './src/index.start.ts' },
				server: { entry: './src/index.server.ts' },
				client: { entry: './src/index.client.tsx' },
			}),
			react(),
		],

		server: {
			port,
			cors: config.mode === 'development' ? false : undefined,
			allowedHosts: config.mode === 'development' ? allowedHosts : [],
		},
		preview: {
			allowedHosts: config.mode === 'preview' ? allowedHosts : [],
		},
		build: {
			minify: 'oxc',
			rollupOptions: {
				external: ['cloudflare:workers'],
				output: {
					minify: {
						compress:
							config.mode === 'production'
								? { dropConsole: true, dropDebugger: true }
								: undefined,
					},
				},
			},
		},
		define: {
			__BASE_URL__: JSON.stringify(
				env.VITE_BASE_URL
					? env.VITE_BASE_URL
					: config.mode === 'development'
						? `http://localhost:${port}`
						: (env.VITE_BASE_URL ?? ''),
			),
			__BUILD_VERSION__: JSON.stringify(
				env.CF_PAGES_COMMIT_SHA?.slice(0, 8) ?? Date.now().toString(),
			),
			'import.meta.env.VITE_TEMPO_ENV': JSON.stringify(
				wranglerVars.VITE_TEMPO_ENV || cloudflareEnv || env.VITE_TEMPO_ENV,
			),
		},
	}
})

function vitePluginAlias(): Plugin {
	return {
		name: 'app-aliases',
		resolveId(id) {
			if (id.startsWith('#tanstack')) return
			if (!id.startsWith('#')) return
			return this.resolve(`${__dirname}/src/${id.slice(1)}`)
		},
	}
}
