import { Hono } from 'hono'
import { tempoDevnet, tempoTestnet } from '#chains.ts'
import { Docs } from '#docs.tsx'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

const _CHAIN_IDS = [tempoDevnet.id, tempoTestnet.id]

app
	.get('/', (_) => new Response('ok'))
	.get('/health', (_) => new Response('ok'))
	.get('/docs', async (context) => context.html(<Docs />))

app.get('/chains', (context) =>
	context.json({
		[tempoDevnet.id]: tempoDevnet,
		[tempoTestnet.id]: tempoTestnet,
	}),
)

export default app satisfies ExportedHandler<Cloudflare.Env>
