import * as z from 'zod/mini'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwind from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart as tanstack } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv } from 'vite'
import vitePluginChromiumDevTools from 'vite-plugin-devtools-json'
import { visualizer } from 'rollup-plugin-visualizer'
import Sonda from 'sonda/vite'

import { getVendorChunk } from './scripts/chunk-config.ts'

import wranglerJSON from '#wrangler.json' with { type: 'json' }

const enabledSchema = z.stringbool({
	truthy: ['true', '1', 'yes', 'on', 'y', 'enabled'],
	falsy: ['false', '0', 'no', 'off', 'n', 'disabled'],
})

const canonicalTempoEnvSchema = z.union([
	z.literal('devnet'),
	z.literal('testnet'),
	z.literal('mainnet'),
])

const tempoEnvSchema = z.prefault(
	z.pipe(
		z.pipe(
			z.string(),
			z.transform((value) =>
				value === 'moderato'
					? 'testnet'
					: value === 'presto'
						? 'mainnet'
						: value,
			),
		),
		canonicalTempoEnvSchema,
	),
	'testnet',
)

const envConfigSchema = z.object({
	PORT: z.prefault(z.coerce.number(), 3_007),
	VITE_ENABLE_DEMO: z.prefault(enabledSchema, 'true'),
	CLOUDFLARE_ENV: tempoEnvSchema,
	VITE_TEMPO_ENV: tempoEnvSchema,
	VITE_ENABLE_DEVTOOLS: z.prefault(enabledSchema, 'false'),
	ALLOWED_HOSTS: z.prefault(
		z.pipe(
			z.string(),
			z.transform((x) => x.split(',').filter(Boolean)),
		),
		'',
	),
	VITE_BASE_URL: z.prefault(z.string(), ''),
	SENTRY_ORG: z.optional(z.string()),
	SENTRY_PROJECT: z.optional(z.string()),
	SENTRY_AUTH_TOKEN: z.optional(z.string()),
	ANALYZE: z.prefault(enabledSchema, 'false'),
	ANALYZE_JSON: z.prefault(enabledSchema, 'false'),
	CF_PAGES_COMMIT_SHA: z.optional(z.string()),
})

const [, , , ...args] = process.argv

export default defineConfig((config) => {
	const env = loadEnv(config.mode, process.cwd(), '')
	const {
		data: envConfig,
		success,
		error,
	} = envConfigSchema.safeParse({ ...env, ...process.env })
	if (!success) throw new Error(z.prettifyError(error))

	const wranglerVars = wranglerJSON.env[envConfig.VITE_TEMPO_ENV].vars
	const tempoEnv = tempoEnvSchema.safeParse(wranglerVars.VITE_TEMPO_ENV)
	if (!tempoEnv.success) throw new Error(z.prettifyError(tempoEnv.error))

	if (envConfig.VITE_TEMPO_ENV !== tempoEnv.data)
		throw new Error(
			[
				`VITE_TEMPO_ENV mismatch - ${envConfig.VITE_TEMPO_ENV} !== ${tempoEnv.data}`,
				'Check `.env`/injected vars vs. `wrangler.json` for consistency.',
			].join('\n'),
		)

	const lastPort = (() => {
		const index = args.lastIndexOf('--port')
		return index === -1 ? null : (args.at(index + 1) ?? null)
	})()
	const port = Number(lastPort ?? envConfig.PORT)

	const shouldUploadSourcemaps = Boolean(
		(envConfig.SENTRY_AUTH_TOKEN || envConfig.SENTRY_AUTH_TOKEN === '') &&
			(envConfig.SENTRY_ORG || envConfig.SENTRY_ORG === '') &&
			(envConfig.SENTRY_PROJECT || envConfig.SENTRY_PROJECT === ''),
	)

	return {
		resolve: {
			tsconfigPaths: true,
			alias: {
				'#': './src',
				'#package.json': './package.json',
				'#wrangler.json': './wrangler.json',
			},
		},
		plugins: [
			config.mode === 'development' &&
				envConfig.VITE_ENABLE_DEVTOOLS &&
				devtools(),
			config.mode === 'development' &&
				envConfig.VITE_ENABLE_DEVTOOLS &&
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
			envConfig.ANALYZE && Sonda(),
			envConfig.ANALYZE_JSON &&
				visualizer({
					filename: 'stats.json',
					template: 'raw-data',
					gzipSize: true,
					brotliSize: true,
				}),
			shouldUploadSourcemaps &&
				sentryVitePlugin({
					org: envConfig.SENTRY_ORG,
					project: envConfig.SENTRY_PROJECT,
					authToken: envConfig.SENTRY_AUTH_TOKEN,
					sourcemaps: {
						filesToDeleteAfterUpload: ['dist/**/*.map'],
					},
				}),
		].filter(Boolean),
		server: {
			port,
			cors: config.mode === 'development' ? false : undefined,
			allowedHosts:
				config.mode === 'development' ? envConfig.ALLOWED_HOSTS : [],
		},
		preview: {
			allowedHosts: config.mode === 'preview' ? envConfig.ALLOWED_HOSTS : [],
		},
		build: {
			minify: 'oxc',
			sourcemap: envConfig.ANALYZE
				? true
				: shouldUploadSourcemaps
					? 'hidden'
					: false,
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
			'import.meta.env.VITE_TEMPO_ENV': JSON.stringify(
				wranglerVars.VITE_TEMPO_ENV || envConfig.VITE_TEMPO_ENV,
			),
			__BASE_URL__: JSON.stringify(
				envConfig.VITE_BASE_URL
					? envConfig.VITE_BASE_URL
					: config.mode === 'development'
						? `http://localhost:${port}`
						: (envConfig.VITE_BASE_URL ?? ''),
			),
			__BUILD_VERSION__: JSON.stringify(
				envConfig.CF_PAGES_COMMIT_SHA?.slice(0, 8) ?? Date.now().toString(),
			),
		},
	}
})
