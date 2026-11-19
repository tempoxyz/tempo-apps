import * as Json from 'ox/Json'

const CACHE_ORIGIN = 'https://explore.tempo.xyz'

export async function withImmutableDataCache<T>(options: {
	key: string
	load: () => Promise<T>
	shouldCache?: ((data: T) => boolean) | undefined
	ttlSeconds?: number | ((data: T) => number) | undefined
}): Promise<T> {
	if (typeof window !== 'undefined' || typeof caches === 'undefined')
		return options.load()

	const cache = (caches as unknown as { default: Cache }).default
	const cacheKey = new Request(
		`${CACHE_ORIGIN}/__immutable-data/${encodeURIComponent(options.key)}`,
	)

	try {
		const cached = await cache.match(cacheKey)
		if (cached) return Json.parse(await cached.text()) as T
	} catch {
		await cache.delete(cacheKey).catch(() => false)
	}

	const data = await options.load()
	if (options.shouldCache && !options.shouldCache(data)) return data
	const ttlSeconds =
		typeof options.ttlSeconds === 'function'
			? options.ttlSeconds(data)
			: (options.ttlSeconds ?? 3600)

	try {
		await cache.put(
			cacheKey,
			new Response(Json.stringify(data), {
				headers: {
					'Cache-Control': `public, max-age=${ttlSeconds}`,
					'Content-Type': 'application/json',
				},
			}),
		)
	} catch {
		// Cache availability must never make the underlying request fail.
	}
	return data
}
