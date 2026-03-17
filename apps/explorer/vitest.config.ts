import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

export default {
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: './wrangler.json',
			},
		}),
	],
}
