import { Hono } from 'hono'

const app = new Hono<{ Bindings: Cloudflare.Env }>()

app.get('/', (c) => c.text('OK'))
app.get('/health', (c) => c.text('OK'))

export default app
