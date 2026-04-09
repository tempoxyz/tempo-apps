import * as NodeOS from 'node:os'
import * as NodePath from 'node:path'
import { drizzle } from 'drizzle-orm/d1'
import * as NodeFS from 'node:fs/promises'
import * as NodeProcess from 'node:process'
import { getPlatformProxy } from 'wrangler'

import * as DB from '#database/schema.ts'
import { seedNativeContracts } from './seed.ts'

import wranglerJSON from '#wrangler.json' with { type: 'json' }

const [, , ...args] = process.argv
const isRemote = args.includes('--remote')
const isDryRun = args.includes('--dry-run')

main().catch((error) => {
	console.error('Error seeding native contracts:', error)
	NodeProcess.exit(1)
})

async function main() {
	const temporaryWranglerPath = await temporaryWranglerFileWorkaround()

	try {
		const platform = await getPlatformProxy<Cloudflare.Env>({
			persist: true,
			remoteBindings: isRemote,
			configPath: temporaryWranglerPath,
		})

		try {
			const db = drizzle(platform.env.CONTRACTS_DB, { schema: DB })

			if (isDryRun) {
				console.info(await db.select().from(DB.nativeContractsTable).all())
				return
			}

			const result = await seedNativeContracts(db)
			console.log(JSON.stringify(result, null, 2))
		} finally {
			await platform.dispose()
		}
	} finally {
		await NodeFS.rm(NodePath.dirname(temporaryWranglerPath), {
			recursive: true,
			force: true,
		})
	}
}

async function temporaryWranglerFileWorkaround() {
	const temporaryWranglerConfig = structuredClone(wranglerJSON)
	const problematicWranglerFields = [
		'containers',
		'migrations',
		'durable_objects',
	] as const

	for (const field of problematicWranglerFields)
		delete temporaryWranglerConfig[field]

	temporaryWranglerConfig.main = NodePath.resolve(temporaryWranglerConfig.main)
	temporaryWranglerConfig.d1_databases =
		temporaryWranglerConfig.d1_databases.map((database) => ({
			...database,
			migrations_dir: NodePath.resolve(database.migrations_dir),
			remote: isRemote,
		}))

	const temporaryDirectory = await NodeFS.mkdtemp(
		NodePath.join(NodeOS.tmpdir(), 'contracts-seed-'),
	)
	const temporaryWranglerPath = NodePath.join(
		temporaryDirectory,
		'wrangler.json',
	)
	await NodeFS.writeFile(
		temporaryWranglerPath,
		JSON.stringify(temporaryWranglerConfig),
	)

	return temporaryWranglerPath
}
