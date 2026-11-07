/**
 * Keys for the send rate limits. They only bucket requests: the attestation's
 * `sub` and the email recipient stay the exact normalized address.
 */

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/**
 * The inbox an address delivers to, so aliases share one bucket: a +tag is
 * removed for every domain, and for Gmail dots are removed too and
 * googlemail.com counts as gmail.com. Expects a normalized address.
 */
export function canonicalInbox(email: string): string {
	const at = email.lastIndexOf('@')
	let local = email.slice(0, at)
	let domain = email.slice(at + 1)
	const plus = local.indexOf('+')
	if (plus > 0) local = local.slice(0, plus)
	if (GMAIL_DOMAINS.has(domain)) {
		domain = 'gmail.com'
		local = local.replace(/\./g, '') || local
	}
	return `${local}@${domain}`
}

/**
 * The client bucket: IPv4 addresses as they are, IPv6 addresses by their /64
 * prefix, since one host commonly controls a whole /64. A Cloudflare Worker on
 * another zone is keyed by its zone (the `CF-Worker` header, which callers
 * cannot remove), since all such Workers share one egress address.
 */
export function clientBucket(
	ip: string | undefined,
	worker?: string | undefined,
): string {
	const zone = worker?.trim().toLowerCase()
	if (zone) return `worker:${zone}`
	const value = ip?.trim().toLowerCase()
	if (!value) return 'unknown'
	if (!value.includes(':')) return value
	const groups = expandIpv6(value)
	if (!groups) return value
	// IPv4-mapped addresses (::ffff:a.b.c.d) are IPv4 clients.
	if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
		const [hi = 0, lo = 0] = groups.slice(6)
		return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
	}
	return `${groups
		.slice(0, 4)
		.map((g) => g.toString(16))
		.join(':')}::/64`
}

/** Expands an IPv6 address into its 8 16-bit groups, or undefined if malformed. */
function expandIpv6(address: string): number[] | undefined {
	let value = address.replace(/%.*$/, '')
	// An embedded IPv4 tail becomes two hex groups.
	const v4 = value.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
	if (v4) {
		const [a, b, c, d] = v4.slice(1).map(Number) as [
			number,
			number,
			number,
			number,
		]
		if ([a, b, c, d].some((n) => n > 255)) return undefined
		value = `${value.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
	}
	const halves = value.split('::')
	if (halves.length > 2) return undefined
	const parse = (part: string | undefined) =>
		part ? part.split(':') : ([] as string[])
	const head = parse(halves[0])
	const tail = parse(halves[1])
	const missing = 8 - head.length - tail.length
	if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined
	const parts = [...head, ...Array<string>(missing).fill('0'), ...tail]
	const groups: number[] = []
	for (const part of parts) {
		if (!/^[0-9a-f]{1,4}$/.test(part)) return undefined
		groups.push(Number.parseInt(part, 16))
	}
	return groups
}
