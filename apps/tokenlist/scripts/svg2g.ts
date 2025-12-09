/**
 * loop through every svg in data recursively
 * optimize the svg
 * write the optimized svg to the same path
 */

import NodeFS from 'node:fs/promises'
import NodePath from 'node:path'
import { optimize } from 'svgo'

const dataDirectoryPath = NodePath.join(process.cwd(), 'data')
const svgGlob = NodeFS.glob(NodePath.join(dataDirectoryPath, '**/*.svg'))

for await (const absoluteFilePath of svgGlob) {
	console.info(`Optimizing ${absoluteFilePath}…`)
	const svg = await NodeFS.readFile(absoluteFilePath, 'utf-8')
	const optimized = optimize(svg)
	await NodeFS.writeFile(absoluteFilePath, optimized.data)
}
