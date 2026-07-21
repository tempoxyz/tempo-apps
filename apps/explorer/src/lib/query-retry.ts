const NON_RETRYABLE_HTTP_STATUS = /(?:status:\s*|\b)(402|403|429)\b/i

export function shouldRetryQuery(
	failureCount: number,
	error: unknown,
): boolean {
	if (failureCount >= 2) return false

	const message = error instanceof Error ? error.message : String(error)
	return !NON_RETRYABLE_HTTP_STATUS.test(message)
}
