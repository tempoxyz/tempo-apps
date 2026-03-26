import { Hono } from 'hono'

type Env = {
	Bindings: {
		ASSETS: Fetcher
	}
}

const app = new Hono<Env>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.all('*', async (c) => {
	return c.env.ASSETS.fetch(c.req.raw)
})

export default app
