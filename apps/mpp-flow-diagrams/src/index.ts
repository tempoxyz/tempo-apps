import { Hono } from 'hono'
import { z } from 'zod'
import type {
	MppService,
	ServiceCatalogResponse,
	ServicePort,
} from './types.ts'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

const rawServiceSchema = z
	.object({
		categories: z.array(z.string()).optional(),
		description: z.string().optional(),
		id: z.string().optional(),
		name: z.string().optional(),
		realm: z.string().optional(),
		serviceUrl: z.string().optional(),
		status: z.string().optional(),
		tags: z.array(z.string()).optional(),
		url: z.string().optional(),
	})
	.passthrough()

const serviceListSchema = z.union([
	z.array(rawServiceSchema),
	z.object({ services: z.array(rawServiceSchema) }).passthrough(),
])

const fallbackServices: MppService[] = [
	createService({
		id: 'web-search',
		name: 'Parallel Web Search',
		realm: 'parallelmpp.dev',
		description: 'Searches the web and returns grounded snippets.',
	}),
	createService({
		id: 'token-price',
		name: 'CoinGecko Price',
		realm: 'coingecko.mpp.paywithlocus.com',
		description: 'Looks up token price and market data.',
	}),
	createService({
		id: 'onchain-data',
		name: 'Onchain Data',
		realm: 'onchain.mpp.tempo.xyz',
		description: 'Reads chain state for account, token, and transaction steps.',
	}),
]

app.get('/api/health', (context) => context.json({ ok: true }))

app.get('/api/services', async (context) => {
	const source = context.env.MPP_SERVICES_URL || 'https://mpp.dev/api/services'
	const services = await fetchServices(source)
	const body: ServiceCatalogResponse = {
		services,
		source,
		accountSdk: {
			packageName: 'accounts',
			purpose:
				'Connect a Tempo account before executing saved diagrams or funding MPP requests.',
		},
	}

	return context.json(body, 200, {
		'Cache-Control': 'public, max-age=60',
	})
})

app.get('/app.js', (context) => context.env.ASSETS.fetch(context.req.raw))
app.get('/style.css', (context) => context.env.ASSETS.fetch(context.req.raw))
app.get('*', (context) =>
	context.html(
		`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>MPP Flow Diagrams</title>
		<link rel="stylesheet" href="/style.css" />
	</head>
	<body>
		<main id="app"></main>
		<script type="module" src="/app.js"></script>
	</body>
</html>`,
	),
)

async function fetchServices(source: string): Promise<MppService[]> {
	try {
		const response = await fetch(source, {
			headers: { Accept: 'application/json' },
			cf: { cacheTtl: 60 },
		})
		if (!response.ok) return fallbackServices

		const parsed = serviceListSchema.safeParse(await response.json())
		if (!parsed.success) return fallbackServices

		const rawServices = Array.isArray(parsed.data)
			? parsed.data
			: parsed.data.services
		const services = rawServices
			.map((service, index) =>
				createService({
					id: service.id ?? slugify(service.name ?? `service-${index + 1}`),
					name: service.name ?? service.id ?? `MPP Service ${index + 1}`,
					realm:
						service.realm ??
						realmFromUrl(service.serviceUrl ?? service.url) ??
						`${service.id ?? `service-${index + 1}`}.mpp.tempo.xyz`,
					description:
						service.description ??
						'MPP service step with configurable request input and typed outputs.',
				}),
			)
			.slice(0, 24)

		return services.length > 0 ? services : fallbackServices
	} catch {
		return fallbackServices
	}
}

function createService(input: {
	id: string
	name: string
	realm: string
	description: string
}): MppService {
	return {
		...input,
		inputs: [
			createPort('request', 'Request', 'json'),
			createPort('account', 'Tempo account', 'accounts.Account'),
		],
		outputs: [
			createPort('result', 'Result', 'json'),
			createPort('proof', 'MPP proof', 'mpp.Proof'),
		],
	}
}

function createPort(id: string, label: string, schema: string): ServicePort {
	return { id, label, schema }
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
}

function realmFromUrl(value: string | undefined): string | undefined {
	if (!value) return undefined
	try {
		return new URL(value).hostname
	} catch {
		return undefined
	}
}

export default app satisfies ExportedHandler<Cloudflare.Env>
