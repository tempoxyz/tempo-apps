import { cloudflare } from '@cloudflare/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { parse } from 'jsonc-parser'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vitePluginChromiumDevTools from 'vite-plugin-devtools-json'
import { visualizer } from 'rollup-plugin-visualizer'
import Sonda from 'sonda/vite'
import { getVendorChunk } from './scripts/chunk-config'

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

	// CLOUDFLARE_ENV is set by CI from matrix.env, or can be set locally
	// This selects the wrangler environment (testnet, moderato, devnet)
	// which provides VITE_TEMPO_ENV and other vars
	const cloudflareEnv = process.env.CLOUDFLARE_ENV || env.CLOUDFLARE_ENV
	const wranglerVars = getWranglerEnvVars(cloudflareEnv)

	const showDevtools = env.VITE_ENABLE_DEVTOOLS !== 'false'

	const lastPort = (() => {
		const index = args.lastIndexOf('--port')
		return index === -1 ? null : (args.at(index + 1) ?? null)
	})()
	const port = Number(lastPort ?? env.PORT ?? 3_000)

	const allowedHosts = env.ALLOWED_HOSTS?.split(',') ?? []

	return {
		plugins: [
			vitePluginAlias(),
			config.mode === 'development' && showDevtools && devtools(),
			config.mode === 'development' &&
				showDevtools &&
				vitePluginChromiumDevTools(),
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
			// Bundle analysis - Sonda for visualization, stats.json for diffs
			process.env.ANALYZE === 'true' && Sonda(),
			process.env.ANALYZE_JSON === 'true' &&
				visualizer({
					filename: 'stats.json',
					template: 'raw-data',
					gzipSize: true,
					brotliSize: true,
				}),
		].filter(Boolean),
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
			sourcemap: process.env.ANALYZE === 'true', // Required for Sonda
			rollupOptions: {
				output: {
					minify: {
						compress:
							config.mode === 'production'
								? { dropConsole: true, dropDebugger: true }
								: undefined,
					},
					manualChunks: (id, { getModuleInfo }) => {
						// Only apply vendor chunking to client builds to avoid bundling
						// browser-specific code (window, document, etc.) into the server bundle
						const moduleInfo = getModuleInfo(id)
						const isClientBuild =
							id.includes('index.client') ||
							id.includes('/client/') ||
							moduleInfo?.importers.some(
								(importer) =>
									importer.includes('index.client') ||
									importer.includes('/client/'),
							)

						return getVendorChunk(id, isClientBuild)
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
				wranglerVars.VITE_TEMPO_ENV ||
					cloudflareEnv ||
					process.env.VITE_TEMPO_ENV ||
					env.VITE_TEMPO_ENV,
			),
			'import.meta.env.VITE_ENABLE_DEMO': JSON.stringify(
				env.VITE_ENABLE_DEMO ?? 'true',
			),
		},
	}
})

function vitePluginAlias(): Plugin {
	return {
		// rolldown doesn't support interpolations in alias
		// replacements so we use a custom resolver instead
		name: 'explorer-aliases',
		resolveId(id) {
			if (id.startsWith('#tanstack')) return
			if (!id.startsWith('#')) return
			return this.resolve(`${__dirname}/src/${id.slice(1)}`)
		},
	}
}
