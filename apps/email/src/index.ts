import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import * as z from 'zod'

const emailAddress = z.object({
	email: z.string().email(),
	name: z.string(),
})

const sendSchema = z.object({
	from: z.union([z.string().email(), emailAddress]),
	to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
	subject: z.string().min(1),
	replyTo: z.union([z.string().email(), emailAddress]).optional(),
	cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
	bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
	text: z.string().optional(),
	html: z.string().optional(),
})

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use('*', cors())

app.get('/health', (c) => c.text('ok'))

app.post('/send', zValidator('json', sendSchema), async (c) => {
	const body = c.req.valid('json')

	await c.env.SEND_EMAIL.send(body)

	return c.json({ success: true })
})

export default app
