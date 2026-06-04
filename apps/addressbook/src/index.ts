import { env } from 'cloudflare:workers'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import * as z from 'zod'

type Visibility = 'public' | 'group' | 'private'

type Session = {
	userId: string
	groupIds: string[]
}

type LabelRecord = {
	id: string
	address: `0x${string}`
	label: string
	visibility: Visibility
	source: string
	ownerUserId?: string
	groupId?: string
	createdBy?: string
	createdAt: string
	updatedAt: string
}

const MAX_RESOLVE_ADDRESSES = 100

const app = new Hono()

app.use(
	'*',
	cors({
		origin: (origin) => {
			if (env.ALLOWED_ORIGINS === '*') return '*'
			if (origin && env.ALLOWED_ORIGINS.split(',').includes(origin))
				return origin
			return null
		},
		allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
		allowHeaders: ['Content-Type', 'Authorization', 'X-Tempo-Account'],
		maxAge: 86400,
	}),
)

app.onError((error, c) => {
	if (error instanceof HTTPException) return error.getResponse()

	console.error('Unexpected error:', error)
	return c.text('Internal Server Error', 500)
})

const addressSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address')
	.transform((address) => address.toLowerCase() as `0x${string}`)

const visibilitySchema = z.enum(['public', 'group', 'private'])

const labelInputSchema = z
	.object({
		address: addressSchema,
		label: z.string().trim().min(1).max(120),
		visibility: visibilitySchema.default('private'),
		source: z.string().trim().min(1).max(80).default('user'),
		groupId: z.string().trim().min(1).max(120).optional(),
	})
	.refine((input) => input.visibility !== 'group' || input.groupId, {
		message: 'groupId is required for group labels',
		path: ['groupId'],
	})

const listQuerySchema = z.object({
	address: addressSchema.optional(),
	visibility: visibilitySchema.optional(),
	groupId: z.string().trim().min(1).max(120).optional(),
})

const resolveSchema = z.object({
	addresses: z.array(addressSchema).min(1).max(MAX_RESOLVE_ADDRESSES),
})

const importSchema = z.object({
	labels: z.array(labelInputSchema).min(1).max(500),
})

app.get('/health', (c) => c.json({ ok: true }))

app.get('/labels', zValidator('query', listQuerySchema), async (c) => {
	const session = readSession(c.req.raw)
	const query = c.req.valid('query')
	const labels = await listLabels()

	return c.json({
		labels: labels
			.filter((label) => canRead(label, session))
			.filter((label) => !query.address || label.address === query.address)
			.filter(
				(label) => !query.visibility || label.visibility === query.visibility,
			)
			.filter((label) => !query.groupId || label.groupId === query.groupId),
	})
})

app.post('/labels', zValidator('json', labelInputSchema), async (c) => {
	const session = requireSession(c.req.raw)
	const input = c.req.valid('json')
	assertCanWrite(input, session)

	const label = makeLabel(input, session)
	await putLabel(label)

	return c.json({ label }, 201)
})

app.post('/import', zValidator('json', importSchema), async (c) => {
	const session = requireSession(c.req.raw)
	const input = c.req.valid('json')

	const labels = input.labels.map((labelInput) => {
		assertCanWrite(labelInput, session)
		return makeLabel(labelInput, session)
	})

	await Promise.all(labels.map(putLabel))

	return c.json({ labels }, 201)
})

app.post('/resolve', zValidator('json', resolveSchema), async (c) => {
	const session = readSession(c.req.raw)
	const { addresses } = c.req.valid('json')
	const labels = await listLabels()
	const visibleLabels = labels.filter((label) => canRead(label, session))

	const resolved = Object.fromEntries(
		addresses.map((address) => [
			address,
			pickBestLabel(
				visibleLabels.filter((label) => label.address === address),
				session,
			),
		]),
	)

	return c.json({ labels: resolved })
})

app.delete('/labels/:id', async (c) => {
	const session = requireSession(c.req.raw)
	const id = c.req.param('id')
	const label = await getLabel(id)

	if (!label) return c.text('Not Found', 404)
	if (!canWriteExisting(label, session)) return c.text('Forbidden', 403)

	await env.ADDRESSBOOK.delete(labelKey(id))
	await removeFromAddressIndex(label)

	return c.body(null, 204)
})

function readSession(request: Request): Session | undefined {
	const header = request.headers.get('X-Tempo-Account')
	if (!header) return undefined

	try {
		const parsed = z
			.object({
				userId: z.string().min(1),
				groupIds: z.array(z.string().min(1)).default([]),
			})
			.parse(JSON.parse(header))

		return parsed
	} catch {
		throw new HTTPException(401, { message: 'Invalid account session' })
	}
}

function requireSession(request: Request): Session {
	const session = readSession(request)
	if (!session)
		throw new HTTPException(401, { message: 'Authentication required' })
	return session
}

function assertCanWrite(
	input: z.infer<typeof labelInputSchema>,
	session: Session,
) {
	if (
		input.visibility === 'group' &&
		(!input.groupId || !session.groupIds.includes(input.groupId))
	)
		throw new HTTPException(403, { message: 'Group membership required' })
}

function canRead(label: LabelRecord, session: Session | undefined): boolean {
	if (label.visibility === 'public') return true
	if (!session) return false
	if (label.visibility === 'private')
		return label.ownerUserId === session.userId
	return Boolean(label.groupId && session.groupIds.includes(label.groupId))
}

function canWriteExisting(label: LabelRecord, session: Session): boolean {
	if (label.visibility === 'public') return label.createdBy === session.userId
	if (label.visibility === 'private')
		return label.ownerUserId === session.userId
	return Boolean(label.groupId && session.groupIds.includes(label.groupId))
}

function makeLabel(
	input: z.infer<typeof labelInputSchema>,
	session: Session,
): LabelRecord {
	const now = new Date().toISOString()
	const id = crypto.randomUUID()

	return {
		id,
		address: input.address,
		label: input.label,
		visibility: input.visibility,
		source: input.source,
		...(input.visibility === 'private' ? { ownerUserId: session.userId } : {}),
		...(input.visibility === 'group' ? { groupId: input.groupId } : {}),
		createdBy: session.userId,
		createdAt: now,
		updatedAt: now,
	}
}

async function putLabel(label: LabelRecord) {
	await env.ADDRESSBOOK.put(labelKey(label.id), JSON.stringify(label))
	await addToAddressIndex(label)
}

async function getLabel(id: string): Promise<LabelRecord | undefined> {
	const label = await env.ADDRESSBOOK.get<LabelRecord>(labelKey(id), 'json')
	return label ?? undefined
}

async function listLabels(): Promise<LabelRecord[]> {
	const list = await env.ADDRESSBOOK.list({ prefix: 'label:' })
	const labels = await Promise.all(
		list.keys.map((key) => env.ADDRESSBOOK.get<LabelRecord>(key.name, 'json')),
	)

	return labels.filter((label): label is LabelRecord => label !== null)
}

async function addToAddressIndex(label: LabelRecord) {
	const key = addressKey(label.address)
	const ids = new Set((await env.ADDRESSBOOK.get<string[]>(key, 'json')) ?? [])
	ids.add(label.id)
	await env.ADDRESSBOOK.put(key, JSON.stringify([...ids]))
}

async function removeFromAddressIndex(label: LabelRecord) {
	const key = addressKey(label.address)
	const ids = new Set((await env.ADDRESSBOOK.get<string[]>(key, 'json')) ?? [])
	ids.delete(label.id)
	await env.ADDRESSBOOK.put(key, JSON.stringify([...ids]))
}

function pickBestLabel(
	labels: LabelRecord[],
	session: Session | undefined,
): LabelRecord | null {
	return (
		labels.toSorted(
			(a, b) => scoreLabel(b, session) - scoreLabel(a, session),
		)[0] ?? null
	)
}

function scoreLabel(label: LabelRecord, session: Session | undefined): number {
	if (session && label.visibility === 'private') return 300
	if (session && label.visibility === 'group') return 200
	return 100
}

function labelKey(id: string) {
	return `label:${id}`
}

function addressKey(address: `0x${string}`) {
	return `address:${address}`
}

export default app
