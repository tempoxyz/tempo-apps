/**
 * The simulator's call list, and its URL encoding.
 *
 * Kept out of the route module so it stays free of React and icon imports and
 * can be unit tested — importing the route pulls in `~icons/*`, which the node
 * test environment cannot resolve.
 */

/** One entry per call. A single call is just a list of length one. */
export type CallDraft = {
	to: string
	data: string
	value: string
}

export const emptyCall: CallDraft = { to: '', data: '', value: '0' }

/**
 * Calls after the first, for the `calls` search parameter.
 *
 * Returns the array rather than a JSON string on purpose: the router
 * JSON-parses search values, so a schema declared as `string` would reject its
 * own serialized output and take the route down — the trap `gas` fell into
 * when it round-tripped back as a number.
 */
export function serializeExtraCalls(
	calls: readonly CallDraft[],
): string[][] | undefined {
	if (calls.length < 2) return undefined
	return calls.slice(1).map((call) => [call.to, call.data, call.value])
}

export function parseExtraCalls(
	value: readonly (readonly string[])[] | undefined,
): CallDraft[] {
	if (!value) return []
	return value.flatMap((entry) =>
		entry[0]
			? [{ to: entry[0], data: entry[1] ?? '0x', value: entry[2] ?? '0' }]
			: [],
	)
}
