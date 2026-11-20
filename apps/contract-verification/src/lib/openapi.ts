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
 * localhost, loopback, private or link-local IPs, or a Tailscale (`*.ts.net`)
 * host.
 */
export function isNonPublicServerUrl(url: string) {
	let hostname: string
	try {
		// Template variables such as `{port}` aren't valid in a URL.
		hostname = new URL(url.replaceAll(/\{[^}]+\}/g, '0')).hostname
	} catch {
		return false
	}

	if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
	if (hostname === '[::1]' || hostname === '0.0.0.0') return true
	if (hostname === 'ts.net' || hostname.endsWith('.ts.net')) return true
	if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return true

	const octets = hostname.split('.').map(Number)
	if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet)))
		return false
	const [a = 0, b = 0] = octets
	return (
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) || // CGNAT, used by Tailscale
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168)
	)
}
