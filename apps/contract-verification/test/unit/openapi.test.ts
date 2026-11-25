import { describe, expect, it } from 'vitest'

import {
	getOpenApiSpec,
	isNonPublicServerUrl,
	localServers,
} from '#lib/openapi.ts'
import OpenApiSpec from '#openapi.json' with { type: 'json' }

describe('openapi.json', () => {
	it('only lists publicly reachable servers', () => {
		const nonPublic = OpenApiSpec.servers
			.map((server) => server.url)
			.filter(isNonPublicServerUrl)

		expect(nonPublic).toStrictEqual([])
	})
})

describe('getOpenApiSpec', () => {
	it.each([
		'production',
		'test',
		undefined,
	])('returns the published spec when NODE_ENV is %s', (nodeEnv) => {
		const spec = getOpenApiSpec(nodeEnv)

		expect(spec).toBe(OpenApiSpec)
		expect(spec.servers.map((server) => server.url)).not.toContain(
			'http://localhost:{port}',
		)
	})

	it('adds local servers in development', () => {
		const spec = getOpenApiSpec('development')

		expect(spec.servers).toStrictEqual([
			...OpenApiSpec.servers,
			...localServers,
		])
	})
})

describe('isNonPublicServerUrl', () => {
	it.each([
		'http://localhost:{port}',
		'http://localhost:6969',
		'http://127.0.0.1:8545',
		'http://[::1]:8545',
		'http://10.0.0.1',
		'http://172.16.0.1',
		'http://192.168.1.1',
		'http://100.100.100.100',
		'https://host.example.ts.net',
		'https://service.internal',
		'http://localhost.:8545',
		'https://host.example.ts.net.',
		'http://LOCALHOST:8545',
		'http://0.1.2.3',
		'http://[::]',
		'http://[::ffff:127.0.0.1]',
		'http://[::ffff:10.0.0.1]',
		'http://[fc00::1]',
		'http://[fd7a:115c:a1e0::1]',
		'http://[fe80::1]',
		'http://[fe80::1%25eth0]',
		'http://user@localhost',
	])('flags %s', (url) => {
		expect(isNonPublicServerUrl(url)).toBe(true)
	})

	it.each([
		'https://contracts.tempo.xyz',
		'https://contracts.porto.workers.dev',
		'https://sourcify.dev/server',
		'http://[2606:4700::1111]',
		'http://[::ffff:1.1.1.1]',
		'https://localhost.example.com',
		'{CUSTOM_URL}',
	])('allows %s', (url) => {
		expect(isNonPublicServerUrl(url)).toBe(false)
	})
})
