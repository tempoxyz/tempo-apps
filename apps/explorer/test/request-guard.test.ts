import { describe, expect, it } from 'vitest'
import { checkRequestGuard } from '../src/lib/server/request-guard'

describe('request guard', () => {
	it('blocks an ASN configured in the environment', () => {
		const response = checkRequestGuard(
			new Request('https://explorer-testnet.workers.dev/tx/0x123', {
				cf: { asn: 64512 },
			}),
			'13335, 64512',
		)

		expect({
			cacheControl: response?.headers.get('cache-control'),
			status: response?.status,
		}).toEqual({ cacheControl: 'no-store', status: 403 })
	})

	it('allows other traffic', () => {
		const requests: Array<[Request, string | undefined]> = [
			[
				new Request('https://explore.testnet.tempo.xyz/tx/0x123', {
					cf: { asn: 13335 },
				}),
				'64512',
			],
			[
				new Request('https://explore.tempo.xyz/tx/0x123', {
					cf: { asn: 64512 },
				}),
				'13335',
			],
			[new Request('https://explore.testnet.tempo.xyz/tx/0x123'), '64512'],
			[
				new Request('https://explore.testnet.tempo.xyz/tx/0x123', {
					cf: { asn: 64512 },
				}),
				undefined,
			],
		]

		expect(
			requests.map(([request, blockedAsns]) =>
				checkRequestGuard(request, blockedAsns),
			),
		).toEqual([undefined, undefined, undefined, undefined])
	})
})
