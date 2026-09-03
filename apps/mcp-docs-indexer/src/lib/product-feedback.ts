import { z } from 'zod'

const FEEDBACK_ENDPOINT = 'https://tempo.xyz/developers/api/feedback'
const FEEDBACK_TIMEOUT_MS = 5_000

export const productFeedbackSchema = z
	.object({
		kind: z.enum(['bug_report', 'feedback']),
		summary: z.string().trim().min(1).max(200),
		details: z.string().trim().min(1).max(3_000),
		steps_to_reproduce: z.string().trim().min(1).max(2_000).optional(),
		expected_behavior: z.string().trim().min(1).max(2_000).optional(),
		actual_behavior: z.string().trim().min(1).max(2_000).optional(),
	})
	.strict()

const productFeedbackReceiptSchema = z.object({
	accepted: z.literal(true),
	report_id: z.string().min(1),
})

export type ProductFeedback = Readonly<z.infer<typeof productFeedbackSchema>>
export type ProductFeedbackReceipt = Readonly<
	z.infer<typeof productFeedbackReceiptSchema>
>

const SENSITIVE_CONTENT_PATTERNS = [
	/\b0x[a-fA-F0-9]{40}\b/,
	/\b0x[a-fA-F0-9]{64}\b/,
	/\b(?:sk|pk|rk|ghp|gho|github_pat)_[A-Za-z0-9_=-]{16,}\b/,
	/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
	/\b(?:api[_-]?key|token|secret|password|private[_-]?key)\s*[:=]/i,
	/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
	/\b(?:wallet|session)[_-]?id\s*[:=]/i,
	/\braw\s+tool\s+(?:input|output)s?\b/i,
]

export function parseProductFeedback(input: unknown): ProductFeedback {
	const parsed = productFeedbackSchema.safeParse(input)
	if (!parsed.success) throw new Error('Invalid product feedback payload')
	for (const value of Object.values(parsed.data)) {
		if (
			typeof value === 'string' &&
			SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(value))
		) {
			throw new Error(
				'Product feedback must exclude sensitive or identifying data',
			)
		}
	}
	return parsed.data
}

export async function sendProductFeedback(
	report: ProductFeedback,
): Promise<ProductFeedbackReceipt> {
	let response: Response
	try {
		response = await fetch(FEEDBACK_ENDPOINT, {
			body: JSON.stringify({ source: 'mcp', ...report }),
			headers: { 'content-type': 'application/json; charset=utf-8' },
			method: 'POST',
			signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
		})
	} catch {
		throw new Error('Product feedback delivery failed')
	}
	if (!response.ok) {
		throw new Error(
			`Product feedback delivery failed with status ${response.status}`,
		)
	}

	const receipt = productFeedbackReceiptSchema.safeParse(
		await response.json().catch(() => undefined),
	)
	if (!receipt.success) throw new Error('Product feedback was not acknowledged')
	return receipt.data
}
