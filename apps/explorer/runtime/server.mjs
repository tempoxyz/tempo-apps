// Self-host the built Worker for this internal devnet only. No Cloudflare API,
// remote bindings, public preview, or inspector listener is involved.
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Miniflare } from 'miniflare'

const directory = resolve(process.env.EXPLORER_DIST || '../dist')
const serverDirectory = resolve(directory, 'server')
const config = JSON.parse(
	await readFile(resolve(directory, 'server/wrangler.json'), 'utf8'),
)
if (
	config.vars?.VITE_TEMPO_ENV !== 'zone-prover' ||
	config.workers_dev !== false ||
	config.preview_urls !== false ||
	config.routes?.length
)
	throw new Error('Expected an internal-only zone-prover build')

const runtime = new Miniflare({
	host: '0.0.0.0',
	port: Number(process.env.PORT || 8080),
	cf: false,
	modulesRoot: serverDirectory,
	// TanStack resolves server functions with dynamic import specifiers, so
	// register every built module explicitly (entrypoint must be first).
	modules: [
		{ type: 'ESModule', path: resolve(serverDirectory, config.main) },
		...(await readdir(serverDirectory, { recursive: true }))
			.filter((path) => /\.m?js$/.test(path) && path !== config.main)
			.map((path) => ({
				type: 'ESModule',
				path: resolve(serverDirectory, path),
			})),
	],
	compatibilityDate: config.compatibility_date,
	compatibilityFlags: config.compatibility_flags,
	bindings: {
		...config.vars,
		ZONE_PROVER_DATA_EPOCH: process.env.ZONE_PROVER_DATA_EPOCH || 'initial',
	},
	ratelimits: Object.fromEntries(
		config.ratelimits.map(({ name, simple }) => [name, { simple }]),
	),
	assets: {
		directory: resolve(directory, 'client'),
		routerConfig: { has_user_worker: true },
	},
	// workerd otherwise denies private addresses. Only cluster/private networks
	// are needed; this runtime must not fall back to public Tempo APIs.
	outboundService: { network: { allow: ['private'] } },
})

await runtime.ready
for (const signal of ['SIGINT', 'SIGTERM'])
	process.once(signal, async () => {
		await runtime.dispose()
		process.exit(0)
	})
