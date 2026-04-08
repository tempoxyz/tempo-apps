import { type Config, defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.DATABASE_URL

const coreConfig = {
	out: './database/drizzle',
	schema: './database/schema.ts',
} satisfies Pick<Config, 'schema' | 'out'>

export default defineConfig(
	databaseUrl
		? {
				...coreConfig,
				dialect: 'turso',
				dbCredentials: {
					url: databaseUrl,
				},
			}
		: {
				...coreConfig,
				dialect: 'sqlite',
				driver: 'd1-http',
				dbCredentials: {
					token: process.env.CLOUDFLARE_D1_TOKEN,
					accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
					databaseId: process.env.CLOUDFLARE_DATABASE_ID,
				},
			},
)
