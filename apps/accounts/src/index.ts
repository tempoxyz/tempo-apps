import { Hono } from 'hono'
import { cors } from './cors'
import { auth } from './routes/auth'
import { wallets } from './routes/wallets'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.onError((err, c) => {
	console.log(
		`[error] ${c.req.method} ${c.req.path}`,
		err instanceof Error ? (err.stack ?? err.message) : err,
	)
	return c.json({ error: 'Internal server error' }, 500)
})
app.use('*', (c, next) => {
	const isDev = new URL(c.req.url).hostname === 'localhost'
	return cors(isDev)(c, next)
})
app.route('/auth', auth)
app.route('/wallets', wallets)

export default app
