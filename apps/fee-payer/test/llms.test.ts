import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import wrangler from '#wrangler.json' with { type: 'json' }
import fullTemplate from '../src/lib/llms/llms-full.template.md?raw'
import indexTemplate from '../src/lib/llms/llms.template.md?raw'

describe('llms.txt', () => {
	it.each(['llms.txt', 'llms-full.txt'])('serves /%s', {
		timeout: 30_000,
	}, async (file) => {
		const response = await exports.default.fetch(
			new Request(`https://fee-payer.test/${file}`),
		)

		expect(response.status).toBe(200)
		expect(response.headers.get('Content-Type')).toBe(
			'text/plain; charset=utf-8',
		)
		expect(await response.text()).toContain('`GET /usage')
	})

	it.each([
		['llms.template.md', indexTemplate],
		['llms-full.template.md', fullTemplate],
	])('%s lists every wrangler.json host', (_, template) => {
		for (const env of Object.values(wrangler.env))
			for (const route of env.routes)
				expect(template).toContain(`https://${route.pattern}`)
	})
})
