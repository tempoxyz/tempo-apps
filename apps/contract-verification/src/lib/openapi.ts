import OpenApiSpec from '#openapi.json' with { type: 'json' }

export type OpenApiServer = {
	url: string
	description: string
	variables?: Record<string, { default: string; description: string }>
}

/**
 * Servers that only make sense while running the API locally (`pnpm dev`).
 * They are never part of the published spec.
 */
export const localServers: ReadonlyArray<OpenApiServer> = [
	{
		url: 'http://localhost:{port}',
		description: 'Local',
		variables: {
			port: { default: '6969', description: 'localhost port number' },
		},
	},
]

/**
 * The OpenAPI spec served at `/openapi.json`. Local servers are added in
 * development only.
 */
export function getOpenApiSpec(nodeEnv: string | undefined) {
	if (nodeEnv !== 'development') return OpenApiSpec

	return {
		...OpenApiSpec,
		servers: [
			...(OpenApiSpec.servers as Array<OpenApiServer>),
			...localServers,
		],
	}
}

/**
 * Whether a server URL points somewhere that isn't publicly reachable:
 * localhost, loopback, private or link-local IPv4 and IPv6 addresses, or a
 * Tailscale (`*.ts.net`), `.internal` or `.local` host.
 */
export function isNonPublicServerUrl(url: string) {
	const hostname = getHostname(url)
	if (!hostname) return false

	if (hostname.startsWith('[')) return isNonPublicIpv6(hostname.slice(1, -1))

	const ipv4 = parseIpv4(hostname)
	if (ipv4) return isNonPublicIpv4(ipv4)

	return ['localhost', 'ts.net', 'internal', 'local'].some(
		(suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
	)
}

/** Lowercase hostname without trailing dots, or undefined without a host. */
function getHostname(url: string) {
	// Template variables such as `{port}` aren't valid in a URL.
	const filled = url.replaceAll(/\{[^}]+\}/g, '0')
	let hostname: string | undefined
	try {
		hostname = new URL(filled).hostname
	} catch {
		// Fall back to the raw authority for URLs the parser rejects, such as
		// IPv6 literals with a zone ID.
		hostname =
			/^[a-z][a-z\d+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)/i.exec(
				filled,
			)?.[1]
	}
	return hostname?.toLowerCase().replace(/\.+$/, '') || undefined
}

function parseIpv4(value: string) {
	const parts = value.split('.')
	if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part)))
		return undefined
	const octets = parts.map(Number)
	return octets.every((octet) => octet <= 255) ? octets : undefined
}

function isNonPublicIpv4([a = 0, b = 0]: Array<number>) {
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) || // CGNAT, used by Tailscale
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168)
	)
}

function isNonPublicIpv6(value: string) {
	const groups = parseIpv6(value.replace(/%.*$/, ''))
	// Treat anything we can't parse as non-public rather than letting it pass.
	if (!groups) return true

	const [first = 0] = groups
	const isZeroPrefix = groups.slice(0, 5).every((group) => group === 0)
	if (isZeroPrefix && groups[5] === 0 && groups[6] === 0)
		return groups[7] === 0 || groups[7] === 1 // :: and ::1
	if (isZeroPrefix && groups[5] === 0xffff) {
		// IPv4-mapped (::ffff:a.b.c.d)
		const [high = 0, low = 0] = groups.slice(6)
		return isNonPublicIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff])
	}
	return (
		(first & 0xfe00) === 0xfc00 || // unique local, includes Tailscale
		(first & 0xffc0) === 0xfe80 // link-local
	)
}

/** The eight 16-bit groups of an IPv6 address, or undefined if invalid. */
function parseIpv6(value: string) {
	let address = value
	const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(address)?.[1]
	if (dotted) {
		const octets = parseIpv4(dotted)
		if (!octets) return undefined
		const [a = 0, b = 0, c = 0, d = 0] = octets
		address = `${address.slice(0, -dotted.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
	}

	const halves = address.split('::')
	if (halves.length > 2) return undefined
	const toGroups = (half = '') => (half ? half.split(':') : [])
	const head = toGroups(halves[0])
	const tail = toGroups(halves[1])
	const missing = 8 - head.length - tail.length
	if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined

	const groups = [...head, ...Array<string>(missing).fill('0'), ...tail]
	if (groups.some((group) => !/^[\da-f]{1,4}$/i.test(group))) return undefined
	return groups.map((group) => Number.parseInt(group, 16))
}
