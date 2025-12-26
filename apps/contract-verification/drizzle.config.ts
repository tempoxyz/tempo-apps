import NodeChildProcess from 'node:child_process'
import { type Config, defineConfig } from 'drizzle-kit'

const isLocal = process.env.CLOUDFLARE_D1_ENVIRONMENT === 'local'

const dbCredentials = (
	isLocal
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
) satisfies DbCredentials

export default defineConfig({
	schema: './src/database/schema.ts',
	// Use local SQLite for migrations, d1-http for remote
	...(isLocal
		? { dbCredentials, dialect: 'turso' }
		: { dbCredentials, dialect: 'sqlite', driver: 'd1-http' }),
})

type DbCredentials =
	| Extract<Config, { dialect: 'turso'; driver?: never }>['dbCredentials']
	| Extract<Config, { dialect: 'sqlite'; driver: 'd1-http' }>['dbCredentials']
