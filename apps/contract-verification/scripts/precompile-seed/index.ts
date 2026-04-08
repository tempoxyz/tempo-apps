import * as z from 'zod/mini'
import * as NodeURL from 'node:url'
import * as NodeProcess from 'node:process'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import NodeChildProcess from 'node:child_process'

import * as DB from '#database/schema.ts'
import { seedNativeContracts } from './seed.ts'

const boolishSchema = z.stringbool()

const seedEnvsSchema = z.object({
	dryRun: z.prefault(boolishSchema, false),
	DATABASE_URL: z.optional(z.string()),
})

const [, , ...args] = process.argv

const isDryRun = args.includes('--dry-run')
if (isDryRun)
	console.log(
		'\nRunning in dry-run mode. No changes will be made to the database.\n',
	)

main().catch((error) => {
	console.error('Error seeding native contracts:', error)
	NodeProcess.exit(1)
})

async function main() {
	const seedEnvs = seedEnvsSchema.safeParse({
		...process.env,
		dryRun: isDryRun,
	})
	if (!seedEnvs.success)
		throw new Error(
			`Invalid environment variables: ${JSON.stringify(z.prettifyError(seedEnvs.error))}`,
		)

	const url =
		seedEnvs.data.DATABASE_URL ??
		NodeURL.pathToFileURL(
			NodeChildProcess.execSync('/bin/bash scripts/local-d1.sh', {
				cwd: process.cwd(),
			})
				.toString()
				.trim(),
		).href

	const client = createClient({ url })

	try {
		const db = drizzle(client, { schema: DB })
		if (isDryRun) {
			console.info(await db.select().from(DB.nativeContractsTable).all())
			console.log(
				'Dry-run mode: exiting with 0 before `seedNativeContracts` is called.',
			)
			NodeProcess.exit(0)
		}
		const result = await seedNativeContracts(db)
		console.log(JSON.stringify(result, null, 2))
	} finally {
		void client.close()
	}
}
