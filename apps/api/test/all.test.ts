import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { testClient } from 'hono/testing'
import { describe, it, expect } from 'vitest'

import app from '#index.tsx'

function loadEnvFromDotenv(): void {
	const envPath = join(process.cwd(), '.env')
	if (!existsSync(envPath)) return

	const content = readFileSync(envPath, 'utf8')
	for (const line of content.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue

		const equalIndex = trimmed.indexOf('=')
		if (equalIndex <= 0) continue

		const key = trimmed.slice(0, equalIndex).trim()
		if (!key || process.env[key]) continue

		const rawValue = trimmed.slice(equalIndex + 1).trim()
		const value = rawValue.replace(/^['"]|['"]$/g, '')
		process.env[key] = value
	}
}

loadEnvFromDotenv()
const API_KEY = process.env.API_KEY
const CHAIN_ID_FALLBACK = 4217
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const PATH_USD = '0x20c0000000000000000000000000000000000000'

function withApiKey(path: string): string {
	if (!API_KEY) throw new Error('Missing API_KEY in environment')
	const separator = path.includes('?') ? '&' : '?'
	return `${path}${separator}key=${API_KEY}`
}

async function authedJson(
	path: string,
): Promise<{ status: number; data: unknown }> {
	const response = await app.request(`http://localhost${withApiKey(path)}`)
	const data = await response.json()
	return { status: response.status, data }
}

async function authedResponse(path: string): Promise<Response> {
	return app.request(`http://localhost${withApiKey(path)}`)
}

function extractChainIds(data: unknown): number[] {
	if (!data || typeof data !== 'object') return []
	const chains = Reflect.get(data, 'chains')
	if (!Array.isArray(chains)) return []

	const ids: number[] = []
	for (const chain of chains) {
		if (typeof chain === 'number') {
			ids.push(chain)
			continue
		}

		if (!chain || typeof chain !== 'object') continue
		const value = Reflect.get(chain, 'id')
		if (typeof value === 'number') ids.push(value)
	}

	return [...new Set(ids)]
}

let cachedChainId: number | undefined
async function getWorkingChainId(): Promise<number> {
	if (cachedChainId) return cachedChainId

	const versionResponse = await app.request('http://localhost/version')
	const versionData = await versionResponse.json()
	const candidates = extractChainIds(versionData)

	for (const chainId of candidates) {
		const response = await authedResponse(`/accounts/${chainId}/${PATH_USD}`)
		if (response.status === 200) {
			cachedChainId = chainId
			return chainId
		}
	}

	cachedChainId = CHAIN_ID_FALLBACK
	return cachedChainId
}

async function getFeeTokenAddress(chainId: number): Promise<string> {
	const { status, data } = await authedJson(`/fee-tokens/${chainId}`)
	if (status !== 200 || !data || typeof data !== 'object') return PATH_USD

	const feeTokens = Reflect.get(data, 'fee_tokens')
	if (!Array.isArray(feeTokens) || feeTokens.length === 0) return PATH_USD

	const first = feeTokens[0]
	if (!first || typeof first !== 'object') return PATH_USD

	const address = Reflect.get(first, 'address')
	return typeof address === 'string' && address.length > 0 ? address : PATH_USD
}

describe('Basic API Endpoints', () => {
	const client = testClient(app)

	it('should respond to /ping', async () => {
		const response = await client.ping.$get()
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('pong')
	})

	it('should respond to /health', async () => {
		const response = await client.health.$get()
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('ok')
	})

	it('should redirect / to /docs', async () => {
		const response = await client.index.$get('/')
		expect(response.status).toBe(302)
		expect(response.headers.get('Location')).toBe('/docs')
	})

	it('should return OpenAPI spec at /schema/openapi and /schema/openapi.json', async () => {
		const response1 = await client.schema.openapi.$get()
		expect(response1.status).toBe(200)
		const spec1 = await response1.json()

		const response2 = await client.schema['openapi.json'].$get()
		expect(response2.status).toBe(200)
		const spec2 = await response2.json()

		expect(spec1).toEqual(spec2)
	})

	it('should return html for /docs', async () => {
		const response = await client.docs.$get()
		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toContain('text/html')
		const text = await response.text()
		expect(text).toContain('<main id="app"></main>')
	})

	it('should return version info at /version', async () => {
		const response = await client.version.$get()
		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data).toHaveProperty('timestamp')
		expect(data).toHaveProperty('rev')
		expect(data).toHaveProperty('url')
		expect(data).toHaveProperty('chains')
		expect(Array.isArray(data.chains)).toBe(true)
		expect(data).toHaveProperty('source')
	})
})

describe('Protected API Endpoints', () => {
	it('should return account info at /accounts/:chainId/:address', async () => {
		const chainId = await getWorkingChainId()
		const { status, data } = await authedJson(
			`/accounts/${chainId}/${PATH_USD}`,
		)

		expect(status).toBe(200)
		expect(data).toMatchObject({
			chainId,
			address: PATH_USD,
		})
		expect(data).toHaveProperty('balance')
		expect(data).toHaveProperty('nonce')
	})

	it('should return contract info at /contracts/:chainId/:address', async () => {
		const chainId = await getWorkingChainId()
		const { status, data } = await authedJson(
			`/contracts/${chainId}/${PATH_USD}`,
		)

		expect(status).toBe(200)
		expect(data).toMatchObject({
			chainId,
			address: PATH_USD,
		})
		expect(data).toHaveProperty('is_contract')
		expect(data).toHaveProperty('bytecode_size')
	})

	it('should return address transactions at /addresses/:chainId/:address/transactions', async () => {
		const chainId = await getWorkingChainId()
		const { status, data } = await authedJson(
			`/addresses/${chainId}/${ZERO_ADDRESS}/transactions?limit=1`,
		)

		expect(status).toBe(200)
		expect(data).toMatchObject({
			chainId,
			address: ZERO_ADDRESS,
		})
		expect(data).toHaveProperty('transactions')
		expect(data).toHaveProperty('pagination')
	})

	it('should return address transfers at /addresses/:chainId/:address/transfers', async () => {
		const chainId = await getWorkingChainId()
		const { status, data } = await authedJson(
			`/addresses/${chainId}/${ZERO_ADDRESS}/transfers?limit=1`,
		)

		expect(status).toBe(200)
		expect(data).toMatchObject({
			chainId,
			address: ZERO_ADDRESS,
		})
		expect(data).toHaveProperty('transfers')
		expect(data).toHaveProperty('pagination')
	})

	it('should return wallet allowances at /wallets/:chainId/:address/allowances', async () => {
		const chainId = await getWorkingChainId()
		const { status, data } = await authedJson(
			`/wallets/${chainId}/${ZERO_ADDRESS}/allowances?limit=1`,
		)

		expect(status).toBe(200)
		expect(data).toMatchObject({
			chainId,
			wallet_address: ZERO_ADDRESS,
		})
		expect(data).toHaveProperty('allowances')
		expect(data).toHaveProperty('pagination')
	})

	it('should return wallet balance history at /wallets/:chainId/:address/balance-history', async () => {
		const chainId = await getWorkingChainId()
		const { status, data } = await authedJson(
			`/wallets/${chainId}/${ZERO_ADDRESS}/balance-history?limit=1`,
		)

		expect(status).toBe(200)
		expect(data).toMatchObject({
			chainId,
			address: ZERO_ADDRESS,
		})
		expect(data).toHaveProperty('changes')
		expect(data).toHaveProperty('pagination')
	})

	it('should return token holders at /tokens/:chainId/:address/holders', async () => {
		const chainId = await getWorkingChainId()
		const feeToken = await getFeeTokenAddress(chainId)
		const { status, data } = await authedJson(
			`/tokens/${chainId}/${feeToken}/holders?limit=1`,
		)

		expect(status).toBe(200)
		expect(data).toMatchObject({ chainId, token_address: feeToken })
		expect(data).toHaveProperty('holders')
		expect(data).toHaveProperty('pagination')
	})

	it('should return configured fee token at /fee-tokens/:chainId', async () => {
		const chainId = await getWorkingChainId()
		const { status, data } = await authedJson(`/fee-tokens/${chainId}`)

		expect(status).toBe(200)
		expect(data).toHaveProperty('chainId', chainId)
		expect(data).toHaveProperty('fee_tokens')
		expect(Array.isArray((data as { fee_tokens?: unknown }).fee_tokens)).toBe(
			true,
		)
	})

	it('should return fungible assets at /fungibles/assets', async () => {
		const chainId = await getWorkingChainId()
		const feeToken = await getFeeTokenAddress(chainId)
		const { status, data } = await authedJson(
			`/fungibles/assets?fungible_ids=${chainId}.${feeToken}`,
		)

		expect(status).toBe(200)
		expect(data).toHaveProperty('assets')
		expect(Array.isArray((data as { assets?: unknown }).assets)).toBe(true)
	})

	it('should return fungible balances at /fungibles/balances', async () => {
		const chainId = await getWorkingChainId()
		const feeToken = await getFeeTokenAddress(chainId)
		const { status, data } = await authedJson(
			`/fungibles/balances?wallet_addresses=${ZERO_ADDRESS}&fungible_ids=${chainId}.${feeToken}`,
		)

		expect(status).toBe(200)
		expect(data).toHaveProperty('balances')
		expect(Array.isArray((data as { balances?: unknown }).balances)).toBe(true)
	})
})
