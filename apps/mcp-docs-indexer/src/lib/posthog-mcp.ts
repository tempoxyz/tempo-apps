type JsonRpcRequest = {
	id?: string | number | null
	method?: string
	params?: {
		name?: string
		arguments?: unknown
		uri?: unknown
		_meta?: {
			progressToken?: string | number
		}
	}
}

type JsonRpcResponse = {
	result?: unknown
	error?: {
		code?: number
		message?: string
		data?: unknown
	}
}

type PostHogEnv = {
	POSTHOG_PROJECT_API_KEY?: string
	POSTHOG_HOST?: string
}

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'
const MAX_PROPERTY_CHARS = 8000
const REDACTED = '[redacted]'
const SENSITIVE_KEY_PATTERN =
	/(api[_-]?key|authorization|cookie|credential|password|secret|token)/i

export function captureMcpAnalytics(
	req: Request,
	body: JsonRpcRequest | undefined,
	response: Response,
	env: PostHogEnv,
	ctx: ExecutionContext,
): void {
	if (!env.POSTHOG_PROJECT_API_KEY || !body?.method) return

	ctx.waitUntil(
		captureMcpAnalyticsAsync(req, body, response, env).catch(() => undefined),
	)
}

export async function parseJsonRpcRequest(
	req: Request,
): Promise<JsonRpcRequest | undefined> {
	if (req.method !== 'POST') return undefined
	try {
		return (await req.clone().json()) as JsonRpcRequest
	} catch {
		return undefined
	}
}

async function captureMcpAnalyticsAsync(
	req: Request,
	body: JsonRpcRequest,
	response: Response,
	env: PostHogEnv,
): Promise<void> {
	if (!env.POSTHOG_PROJECT_API_KEY || !body.method) return
	const responseBody = await parseJsonRpcResponse(response)
	const event = eventFor(body.method)
	if (!event) return

	const isError =
		Boolean(responseBody?.error) || resultIsError(responseBody?.result)
	const sessionId = sessionIdFor(req, body)
	const properties: Record<string, unknown> = {
		$process_person_profile: false,
		$mcp_method: body.method,
		$mcp_request_id: body.id ?? null,
		$mcp_is_error: isError,
		mcp_server: 'tempo-docs-indexer',
	}

	if (sessionId) properties.$session_id = sessionId
	if (body.method === 'tools/call') {
		properties.$mcp_tool_name = body.params?.name
		properties.$mcp_parameters = sanitize(body.params?.arguments)
		properties.$mcp_response = sanitize(responseBody?.result)
	}
	if (body.method === 'tools/list') {
		properties.$mcp_tools = toolsFrom(responseBody?.result)
	}
	if (body.method === 'initialize') {
		const clientInfo = (
			body.params as { clientInfo?: { name?: unknown; version?: unknown } }
		)?.clientInfo
		properties.$mcp_client_name = clientInfo?.name
		properties.$mcp_client_version = clientInfo?.version
	}
	if (body.method === 'resources/read') {
		properties.$mcp_resource_uri = body.params?.uri
		properties.$mcp_response = sanitize(responseBody?.result)
	}
	if (body.method === 'resources/list') {
		properties.$mcp_resources = resourcesFrom(responseBody?.result)
	}
	if (responseBody?.error) {
		properties.$mcp_error = sanitize(responseBody.error)
	}

	await posthogCapture(env, {
		api_key: env.POSTHOG_PROJECT_API_KEY,
		event,
		distinct_id: sessionId ?? 'anonymous',
		properties: sanitize(properties),
	})
}

async function parseJsonRpcResponse(
	response: Response,
): Promise<JsonRpcResponse | undefined> {
	try {
		const text = await response.clone().text()
		const payload = text.startsWith('event: message')
			? text.match(/^data: (.*)$/m)?.[1]
			: text
		if (!payload) return undefined
		return JSON.parse(payload) as JsonRpcResponse
	} catch {
		return undefined
	}
}

function eventFor(method: string): string | undefined {
	if (method === 'initialize') return '$mcp_initialize'
	if (method === 'tools/list') return '$mcp_tools_list'
	if (method === 'tools/call') return '$mcp_tool_call'
	if (method === 'resources/list') return '$mcp_resources_list'
	if (method === 'resources/read') return '$mcp_resource_read'
	if (method === 'resources/templates/list')
		return '$mcp_resource_templates_list'
	return undefined
}

function resultIsError(result: unknown): boolean {
	return (
		typeof result === 'object' &&
		result !== null &&
		'isError' in result &&
		(result as { isError?: unknown }).isError === true
	)
}

function sessionIdFor(req: Request, body: JsonRpcRequest): string | undefined {
	const progressToken = body.params?._meta?.progressToken
	return (
		req.headers.get('mcp-session-id') ??
		req.headers.get('x-mcp-session-id') ??
		(progressToken === undefined ? undefined : String(progressToken)) ??
		undefined
	)
}

function toolsFrom(result: unknown): unknown {
	if (typeof result !== 'object' || result === null || !('tools' in result)) {
		return undefined
	}
	return (result as { tools?: unknown[] }).tools?.map((tool) => {
		if (typeof tool !== 'object' || tool === null) return tool
		const named = tool as { name?: unknown; description?: unknown }
		return { name: named.name, description: named.description }
	})
}

function resourcesFrom(result: unknown): unknown {
	if (
		typeof result !== 'object' ||
		result === null ||
		!('resources' in result)
	) {
		return undefined
	}
	return (result as { resources?: unknown[] }).resources?.map((resource) => {
		if (typeof resource !== 'object' || resource === null) return resource
		const named = resource as { uri?: unknown; name?: unknown }
		return { uri: named.uri, name: named.name }
	})
}

function sanitize(value: unknown, depth = 0): unknown {
	if (depth > 8) return '[truncated]'
	if (value == null) return value
	if (typeof value === 'string') return truncate(value)
	if (typeof value !== 'object') return value
	if (Array.isArray(value)) {
		return value.slice(0, 50).map((item) => sanitize(item, depth + 1))
	}

	const result: Record<string, unknown> = {}
	for (const [key, child] of Object.entries(value)) {
		result[key] = SENSITIVE_KEY_PATTERN.test(key)
			? REDACTED
			: sanitize(child, depth + 1)
	}
	return result
}

function truncate(value: string): string {
	if (value.length <= MAX_PROPERTY_CHARS) return value
	return `${value.slice(0, MAX_PROPERTY_CHARS)}...[truncated]`
}

async function posthogCapture(
	env: PostHogEnv,
	payload: {
		api_key: string
		event: string
		distinct_id: string
		properties: unknown
	},
): Promise<void> {
	await fetch(`${env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST}/capture/`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload),
	})
}
