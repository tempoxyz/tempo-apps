export const DEFAULT_RPC_CONCURRENCY = 5

export async function mapWithConcurrency<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	concurrency = DEFAULT_RPC_CONCURRENCY,
): Promise<R[]> {
	const results: R[] = []
	let index = 0

	async function worker() {
		while (index < items.length) {
			const currentIndex = index++
			// ast-grep-ignore: no-await-in-loop
			results[currentIndex] = await fn(items[currentIndex])
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()))
	return results
}
