import { z } from 'zod'

const address = z
	.string()
	.regex(/^0x[0-9a-fA-F]{40}$/)
	.transform((value) => value.toLowerCase() as `0x${string}`)
const tenant = z.strictObject({
	orgId: z.string().min(1).max(128),
	projectId: z.string().min(1).max(128).nullable(),
	environment: z.enum(['production', 'sandbox']),
})
const id = z
	.string()
	.regex(
		/^ak_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	)

export const requestSchema = z.discriminatedUnion('operation', [
	z.strictObject({
		operation: z.literal('create'),
		tenant,
		account: address,
		chainId: z.number().int().positive().safe(),
	}),
	z.strictObject({
		operation: z.literal('list'),
		tenant,
		cursor: id.optional(),
	}),
	z.strictObject({ operation: z.literal('get'), tenant, id }),
	z.strictObject({ operation: z.literal('revoke'), tenant, id }),
	z.strictObject({
		operation: z.literal('sign'),
		tenant,
		id,
		transaction: z
			.string()
			.regex(/^0x76(?:[0-9a-fA-F]{2})+$/)
			.max(262144),
	}),
])

export type Request = z.infer<typeof requestSchema>
export type Tenant = Request['tenant']
export type Key = {
	id: string
	account: `0x${string}`
	address: `0x${string}`
	chainId: number
	createdAt: string
	revokedAt?: string
}
