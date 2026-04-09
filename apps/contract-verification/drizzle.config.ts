import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	out: './database/drizzle',
	schema: './database/schema.ts',
	dialect: 'sqlite',
	driver: 'd1-http',
	dbCredentials: {
		token: process.env.CLOUDFLARE_D1_TOKEN,
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
		databaseId: process.env.CLOUDFLARE_DATABASE_ID,
	},
})
