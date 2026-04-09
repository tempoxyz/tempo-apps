import * as NodeFS from 'node:fs'
import * as NodePath from 'node:path'

if (import.meta.main) console.info(localD1().trim())

export function localD1() {
	const paths = NodeFS.globSync(
		`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`,
	).filter((path) => NodePath.basename(path) !== 'metadata.sqlite')

	const [firstPath, ...restPaths] = paths

	if (!firstPath) {
		console.warn(
			[
				'No sqlite files found.',
				'You might need to run `pnpm wrangler d1 migrations apply CONTRACTS_DB --local` once first.',
			].join('\n'),
		)
		process.exit(1)
	}

	const latestPath = restPaths.reduce<string>((latestPath, path) => {
		const latestStat = NodeFS.statSync(latestPath)
		const latestTimestampMs =
			latestStat.birthtimeMs > 0 ? latestStat.birthtimeMs : latestStat.mtimeMs

		const stat = NodeFS.statSync(path)
		const timestampMs = stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs

		return timestampMs > latestTimestampMs ? path : latestPath
	}, firstPath)

	return NodePath.resolve(latestPath)
}
