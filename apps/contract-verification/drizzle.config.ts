import NodeChildProcess from 'node:child_process'
import { defineConfig } from 'drizzle-kit'

const isLocal = process.env.CLOUDFLARE_D1_ENVIRONMENT === 'local'

const dbCredentials = isLocal
	? {
			url: NodeChildProcess.execSync('/bin/bash scripts/local-d1.sh')
				.toString()
				.trim(),
		}
	: {
			token: process.env.CLOUDFLARE_D1_TOKEN,
			accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
			databaseId: process.env.CLOUDFLARE_DATABASE_ID,
		}

export default defineConfig({
	out: './drizzle',
	dialect: 'sqlite',
	schema: './src/database/schema.ts',
	// Use local SQLite for migrations, d1-http for remote
	...(isLocal
		? // Local wrangler D1 SQLite path
			{ dbCredentials }
		: { driver: 'd1-http', dbCredentials }),
})
