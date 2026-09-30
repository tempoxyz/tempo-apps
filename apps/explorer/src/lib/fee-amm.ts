import * as z from 'zod/mini'
import { zAddress } from '#lib/zod'

export const FEE_AMM_MAX_ROWS = 10_000

export const feeAmmSearchSchema = z
	.object({
		token: z.optional(zAddress({ lowercase: true })),
		page: z._default(z.number().check(z.int(), z.gte(1), z.lte(1000)), 1),
		limit: z._default(
			z.union([z.literal(10), z.literal(25), z.literal(50)]),
			10,
		),
	})
	.check(
		z.refine(
			(input) => input.page * input.limit <= FEE_AMM_MAX_ROWS,
			'Page exceeds the available pagination window.',
		),
	)

export type FeeAmmSearch = z.infer<typeof feeAmmSearchSchema>
