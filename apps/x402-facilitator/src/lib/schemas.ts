import { z } from 'zod'

export const paymentPayloadSchema = z.object({
	x402Version: z.literal(2),
	resource: z.object({
		url: z.string(),
		description: z.string(),
		mimeType: z.string(),
	}),
	accepted: z.object({
		scheme: z.literal('exact'),
		network: z.string(),
		amount: z.string(),
		asset: z.string(),
		payTo: z.string(),
		maxTimeoutSeconds: z.number(),
		extra: z
			.object({
				name: z.string().optional(),
				decimals: z.number().optional(),
			})
			.optional(),
	}),
	payload: z.object({
		signedTransaction: z.string(),
	}),
})
