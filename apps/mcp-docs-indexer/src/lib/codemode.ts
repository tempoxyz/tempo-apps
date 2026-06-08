/**
 * Codemode wrapper for the upstream AI Search MCP endpoint.
 *
 * Standard MCP clients hit /mcp on mcp.tempo.xyz (proxied 1:1 to AI Search).
 * Agents that prefer codemode hit /codemode: the upstream tools are
 * introspected once and re-exposed as a single `code` tool whose argument is
 * a JS snippet. The snippet runs in an isolated Worker (WorkerLoader), can
 * chain `codemode.<tool>(...)` calls in one round-trip, and has no network
 * access of its own.
 *
 * @see https://github.com/cloudflare/agents/tree/main/packages/codemode
 */
import { DynamicWorkerExecutor } from '@cloudflare/codemode'
import { codeMcpServer } from '@cloudflare/codemode/mcp'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { ZodTypeAny } from 'zod'

const CLIENT_NAME = 'mcp-docs-indexer-codemode'
const CLIENT_VERSION = '1.0.0'

/**
 * Discover upstream tools via the AI Search MCP endpoint and re-register
 * them on a local server whose handlers proxy each call back upstream.
 *
 * Done per request: the AI Search endpoint is fast, and a per-request
 * client avoids cross-request session state inside the codemode sandbox.
 */
async function buildProxyServer(upstreamUrl: string): Promise<McpServer> {
	const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION })
	await client.connect(new StreamableHTTPClientTransport(new URL(upstreamUrl)))
	const { tools } = await client.listTools()

	const server = new McpServer({ name: 'docs-mcp-proxy', version: '1.0.0' })
	for (const tool of tools) {
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				// Forward the upstream JSON Schema verbatim. The codemode
				// type generator reads `inputSchema` either as a JSON Schema
				// or a ZodRawShape; the SDK's registerTool accepts both.
				inputSchema: tool.inputSchema as unknown as Record<string, ZodTypeAny>,
			},
			async (args) => {
				const result = await client.callTool({
					name: tool.name,
					arguments: args as Record<string, unknown>,
				})
				return result as { content: Array<{ type: 'text'; text: string }> }
			},
		)
	}
	return server
}

/**
 * Handle an MCP request against the codemode-wrapped tool surface.
 *
 * Builds the proxy server + codemode wrapper per request, attaches a
 * stateless StreamableHTTP transport, and returns the Response. Per-request
 * construction is fine here because AI Search's tool list is small and
 * the wrapper is cheap; cache later if profiling shows it matters.
 */
export async function handleCodemodeRequest(
	req: Request,
	opts: { upstreamUrl: string; loader: WorkerLoader },
): Promise<Response> {
	const upstreamServer = await buildProxyServer(opts.upstreamUrl)
	const executor = new DynamicWorkerExecutor({ loader: opts.loader })
	const wrapped = await codeMcpServer({ server: upstreamServer, executor })

	const transport = new WebStandardStreamableHTTPServerTransport({
		// Stateless: no session resumption. Each POST is one round-trip.
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	})
	await wrapped.connect(transport)
	return transport.handleRequest(req)
}
