/**
 * loop through every svg in data recursively
 * optimize the svg
 * write the optimized svg to the same path
 */

import NodePath from 'node:path'
import { optimize } from 'svgo'

const dataDirectoryPath = NodePath.join(process.cwd(), 'data')
const glob = new Bun.Glob(NodePath.join(dataDirectoryPath, '**/*.svg'))

for await (const absoluteFilePath of glob.scan('.')) {
	console.info(`Optimizing ${absoluteFilePath}…`)
	const svg = await Bun.file(absoluteFilePath).text()
	const optimized = optimize(svg)
	await Bun.write(absoluteFilePath, optimized.data)
}
