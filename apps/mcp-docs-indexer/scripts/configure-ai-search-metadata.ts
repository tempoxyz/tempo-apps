import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type MetadataField = {
	field_name: string
	data_type: 'text' | 'number' | 'boolean' | 'datetime'
}

const schemaPath = resolve('ai-search-custom-metadata.json')
const accountId = expectEnv('CLOUDFLARE_ACCOUNT_ID')
const apiToken = expectEnv('CLOUDFLARE_API_TOKEN')
const namespace = process.env.AI_SEARCH_NAMESPACE ?? 'default'
const instanceId = process.env.AI_SEARCH_INSTANCE_ID ?? 'tempo-global'

const schema = validateSchema(
	JSON.parse(await readFile(schemaPath, 'utf8')) as unknown,
)
const endpoint = new URL(
	`/client/v4/accounts/${accountId}/ai-search/namespaces/${namespace}/instances/${instanceId}`,
	'https://api.cloudflare.com',
)

const response = await fetch(endpoint, {
	method: 'PUT',
	headers: {
		Authorization: `Bearer ${apiToken}`,
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({ custom_metadata: schema }),
})

const body = (await response.json().catch(() => null)) as {
	success?: boolean
	errors?: Array<{ message?: string }>
} | null

if (!response.ok || body?.success === false) {
	const message =
		body?.errors
			?.map((error) => error.message)
			.filter(Boolean)
			.join('; ') || `HTTP ${response.status}`
	throw new Error(`Failed to configure AI Search metadata: ${message}`)
}

console.info(
	`Configured ${schema.length} AI Search metadata fields on ${namespace}/${instanceId}`,
)

function expectEnv(name: string): string {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required`)
	return value
}

function validateSchema(value: unknown): MetadataField[] {
	if (!Array.isArray(value)) throw new Error('metadata schema must be an array')
	if (value.length > 5)
		throw new Error('metadata schema cannot exceed 5 fields')

	return value.map((field, index) => {
		if (!field || typeof field !== 'object') {
			throw new Error(`metadata schema field ${index} must be an object`)
		}

		const entry = field as Record<string, unknown>
		const fieldName = entry.field_name
		const dataType = entry.data_type
		if (typeof fieldName !== 'string' || fieldName.trim().length === 0) {
			throw new Error(`metadata schema field ${index} has invalid field_name`)
		}
		if (
			dataType !== 'text' &&
			dataType !== 'number' &&
			dataType !== 'boolean' &&
			dataType !== 'datetime'
		) {
			throw new Error(`metadata schema field ${index} has invalid data_type`)
		}
		if (['timestamp', 'folder', 'filename'].includes(fieldName.toLowerCase())) {
			throw new Error(`metadata schema field ${index} uses a reserved name`)
		}

		return { field_name: fieldName, data_type: dataType }
	})
}
