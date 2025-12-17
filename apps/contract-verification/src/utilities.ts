import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function sourcifyError(
	context: Context,
	status: ContentfulStatusCode,
	customCode: string,
	message: string,
) {
	return context.json(
		{
			message,
			customCode,
			errorId: globalThis.crypto.randomUUID(),
		},
		status,
	)
}
