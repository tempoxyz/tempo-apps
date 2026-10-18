/** Bound the wait even when a binding ignores cancellation. Fetch callers must pass the signal. */
export async function withTimeout<T>(
	operation: (signal: AbortSignal) => Promise<T>,
	timeoutMs: number,
	parent?: AbortSignal,
): Promise<T> {
	const controller = new AbortController()
	const abort = () => controller.abort(parent?.reason)
	if (parent?.aborted) abort()
	else parent?.addEventListener('abort', abort, { once: true })
	const timer = setTimeout(
		() =>
			controller.abort(new Error(`Operation timed out after ${timeoutMs}ms`)),
		timeoutMs,
	)
	let rejectOnAbort: () => void = () => {}
	try {
		controller.signal.throwIfAborted()
		return await Promise.race([
			operation(controller.signal),
			new Promise<never>((_, reject) => {
				rejectOnAbort = () => reject(controller.signal.reason)
				controller.signal.addEventListener('abort', rejectOnAbort, {
					once: true,
				})
				if (controller.signal.aborted) rejectOnAbort()
			}),
		])
	} finally {
		clearTimeout(timer)
		parent?.removeEventListener('abort', abort)
		controller.signal.removeEventListener('abort', rejectOnAbort)
	}
}
