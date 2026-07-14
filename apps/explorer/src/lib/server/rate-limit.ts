type RateLimiter = {
	limit(options: { key: string }): Promise<{ success: boolean }>
}

export type RateLimiters = {
	/** Coarse per-network backstop; catches clients rotating addresses within one ASN. */
	asn?: RateLimiter | undefined
	/** Fixed-key circuit breaker capping total throughput per colo. */
	global?: RateLimiter | undefined
	/** Per-client limit, keyed by IPv4 address or IPv6 /64 prefix. */
	ip?: RateLimiter | undefined
}

/** Layered per-client, per-ASN, and global limits. Fails open when bindings are unavailable (local dev). */
export async function checkRateLimit(
	request: Request,
	limiters: RateLimiters,
): Promise<Response | undefined> {
	try {
		const checks: Array<Promise<{ success: boolean }>> = []
		if (limiters.ip) checks.push(limiters.ip.limit({ key: clientKey(request) }))
		const asn = request.cf?.asn
		if (limiters.asn && asn !== undefined)
			checks.push(limiters.asn.limit({ key: `asn:${asn}` }))
		if (limiters.global) checks.push(limiters.global.limit({ key: 'global' }))

		const results = await Promise.all(checks)
		if (results.some((result) => !result.success))
			return new Response('Rate limit exceeded', {
				status: 429,
				headers: { 'retry-after': '10' },
			})
	} catch (error) {
		console.error('Rate limit check failed:', error)
	}
	return undefined
}

/** IPv4 clients key by address; IPv6 clients by /64 prefix so they cannot rotate within their allocation. */
export function clientKey(request: Request): string {
	const ip = request.headers.get('cf-connecting-ip')
	if (!ip) return 'unknown'
	if (ip.includes('.')) return ip
	return ipv6Prefix(ip)
}

/** First four hextets of an IPv6 address, with `::` expanded. */
function ipv6Prefix(ip: string): string {
	const [address = ''] = ip.split('%')
	const [head = '', tail = ''] = address.split('::')
	const left = head ? head.split(':') : []
	const right = tail ? tail.split(':') : []
	const groups = [
		...left,
		...Array.from(
			{ length: Math.max(8 - left.length - right.length, 0) },
			() => '0',
		),
		...right,
	]
	return groups
		.slice(0, 4)
		.map((group) => Number.parseInt(group || '0', 16).toString(16))
		.join(':')
}
