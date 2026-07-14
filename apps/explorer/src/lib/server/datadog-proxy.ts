const hosts = {
	'ap1.datadoghq.com': 'browser-intake-ap1-datadoghq.com',
	'ap2.datadoghq.com': 'browser-intake-ap2-datadoghq.com',
	'datadoghq.com': 'browser-intake-datadoghq.com',
	'datadoghq.eu': 'browser-intake-datadoghq.eu',
	'ddog-gov.com': 'browser-intake-ddog-gov.com',
	'us2.ddog-gov.com': 'browser-intake-us2-ddog-gov.com',
	'us3.datadoghq.com': 'browser-intake-us3-datadoghq.com',
	'us5.datadoghq.com': 'browser-intake-us5-datadoghq.com',
} as const

const placeholderApplicationId = '00000000-0000-0000-0000-000000000000'
const placeholderClientToken = 'explorer-dd-proxy'

type Config = {
	applicationId: string
	clientToken: string
	host: string
}

type Forward = {
	token: string
	url: URL
}

export async function handleDatadogProxy(request: Request): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 })
	}

	const config = getConfig()
	if (!config)
		return new Response('Datadog proxy misconfigured', { status: 503 })

	const contentLength = request.headers.get('content-length')
	if (contentLength && Number.parseInt(contentLength, 10) > 10_000_000) {
		return new Response('Payload too large', { status: 413 })
	}

	const url = new URL(request.url)
	const forward = getForward(url.searchParams.get('ddforward'))
	if (!forward)
		return new Response('Invalid Datadog forward path', { status: 400 })
	if (forward.token !== placeholderClientToken) {
		return new Response('Datadog client token not allowed', { status: 403 })
	}
	if (url.searchParams.has('ddforwardSubdomain')) {
		return new Response('Datadog subdomain forwarding is not enabled', {
			status: 400,
		})
	}

	const body = await getBody(request, config.applicationId)
	if (body === undefined)
		return new Response('Invalid Datadog payload', { status: 400 })

	const headers = getHeaders(request, config.host)
	const upstream = await fetch(getUrl(config, forward), {
		body,
		headers,
		method: request.method,
		redirect: 'manual',
	})

	return new Response(upstream.body, {
		headers: upstream.headers,
		status: upstream.status,
		statusText: upstream.statusText,
	})
}

function getConfig(): Config | undefined {
	const applicationId = process.env.DATADOG_APPLICATION_ID
	const clientToken = process.env.DATADOG_CLIENT_TOKEN
	const host = getHost(process.env.DATADOG_SITE || 'datadoghq.com')
	if (!applicationId || !clientToken || !host) return undefined
	return { applicationId, clientToken, host }
}

function getHost(site: string): string | undefined {
	return hosts[site as keyof typeof hosts]
}

function getForward(value: string | null): Forward | undefined {
	if (!value?.startsWith('/') || value.startsWith('//')) return undefined

	let url: URL
	try {
		url = new URL(value, 'https://browser-intake.datadog.invalid')
	} catch {
		return undefined
	}

	if (url.pathname !== '/api/v2/rum' || url.hash) return undefined

	const tokens = url.searchParams.getAll('dd-api-key')
	if (tokens.length !== 1) return undefined
	const [token] = tokens
	if (!token) return undefined

	return { token, url }
}

function getHeaders(request: Request, host: string): Headers {
	const headers = new Headers(request.headers)
	headers.delete('authorization')
	headers.delete('content-length')
	headers.delete('cookie')
	headers.delete('set-cookie')
	headers.delete('x-api-key')
	headers.set('host', host)

	const ip = request.headers.get('cf-connecting-ip')
	if (ip) headers.set('x-forwarded-for', ip)

	return headers
}

function getUrl(config: Config, forward: Forward): string {
	const url = new URL(`https://${config.host}${forward.url.pathname}`)
	for (const [key, value] of forward.url.searchParams) {
		url.searchParams.append(
			key,
			key === 'dd-api-key' ? config.clientToken : value,
		)
	}
	return url.toString()
}

async function getBody(
	request: Request,
	applicationId: string,
): Promise<string | undefined> {
	const body = await request.text()
	const lines: string[] = []
	for (const line of body.split('\n')) {
		const rewritten = rewriteEvent(line, applicationId)
		if (rewritten === undefined) return undefined
		lines.push(rewritten)
	}
	return lines.join('\n')
}

function rewriteEvent(line: string, applicationId: string): string | undefined {
	if (!line) return line

	let event: unknown
	try {
		event = JSON.parse(line)
	} catch {
		return undefined
	}

	if (!isObject(event) || !isObject(event.application)) return undefined
	if (event.application.id !== placeholderApplicationId) return undefined

	event.application.id = applicationId
	return JSON.stringify(event)
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}
