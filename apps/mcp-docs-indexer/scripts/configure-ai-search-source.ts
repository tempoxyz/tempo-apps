/** Preview the canonical crawler configuration; pass --apply to update it. */
const account = required('CLOUDFLARE_ACCOUNT_ID')
const token = required('CLOUDFLARE_API_TOKEN')
const namespace = process.env.AI_SEARCH_NAMESPACE ?? 'default'
const instance = process.env.AI_SEARCH_INSTANCE_ID ?? 'tempo-global'
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai-search/namespaces/${encodeURIComponent(namespace)}/instances/${encodeURIComponent(instance)}`
const headers = {
	Authorization: `Bearer ${token}`,
	'Content-Type': 'application/json',
}
const current = await request('GET')
if (current.result?.type !== 'web-crawler')
	throw new Error('Expected a web-crawler instance')
const params = current.result.source_params ?? {}
const crawler = params.web_crawler ?? {}
const patch = {
	source: 'tempo.xyz',
	source_params: {
		...params,
		include_items: [
			'https://tempo.xyz/developers',
			'https://tempo.xyz/developers/**',
		],
		web_crawler: {
			...crawler,
			parse_type: 'sitemap',
			parse_options: {
				...crawler.parse_options,
				specific_sitemaps: ['https://tempo.xyz/developers/sitemap.xml'],
			},
		},
	},
}
// Print only the intended source change, never the instance/token configuration.
console.info(
	JSON.stringify(
		{
			source: patch.source,
			include_items: patch.source_params.include_items,
			specific_sitemaps:
				patch.source_params.web_crawler.parse_options.specific_sitemaps,
		},
		null,
		2,
	),
)
if (process.argv.includes('--apply')) {
	await request('PUT', patch)
	console.info(`Updated crawler source for ${namespace}/${instance}`)
} else console.info('Preview only. Pass --apply to update the instance.')

async function request(method: string, body?: unknown) {
	const response = await fetch(endpoint, {
		method,
		headers,
		...(body ? { body: JSON.stringify(body) } : {}),
	})
	if (!response.ok)
		throw new Error(`AI Search ${method} failed: HTTP ${response.status}`)
	const result = (await response.json()) as {
		success?: boolean
		result?: {
			type?: string
			source_params?: {
				[key: string]: unknown
				web_crawler?: {
					[key: string]: unknown
					parse_options?: Record<string, unknown>
				}
			}
		}
	}
	if (result.success === false) throw new Error(`AI Search ${method} failed`)
	return result
}
function required(name: string): string {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required`)
	return value
}
