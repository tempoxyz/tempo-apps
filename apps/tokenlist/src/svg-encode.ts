#! /usr/bin/env bun

import NodeFS from 'node:fs/promises'
import NodePath from 'node:path'
import NodeProcess from 'node:process'
import type { TokenInfo, TokenListSchema } from '#tokenlist.types.ts'

/**
 * example
 *
 * ```sh
 * bun ./src/svg-encode.ts data/1/icons/eth.svg
 * ```
 */

const [filepath] = NodeProcess.argv.slice(2)

if (!filepath) {
	console.error('Usage: bun ./src/svg-encode.ts <filepath>')
	process.exit(1)
}

// go to `data/1/tokenlist.json`
// add / replace the token's `"extension"'s "inlined" value with the result
// save the file
svgToUrlEncoded(filepath).then(async (result) => {
	const token = filepath.split('/').pop()?.replaceAll('.svg', '')
	const tokenListPath = `${filepath.split('/').slice(0, -2).join('/')}/tokenlist.json`

	const tokenlist = JSON.parse(
		await NodeFS.readFile(tokenListPath, 'utf-8'),
	) as TokenListSchema
	tokenlist.tokens?.forEach((item: TokenInfo) => {
		if (item.symbol.toLowerCase() === token?.toLowerCase()) {
			console.info(`found token: ${item.name}`)
			if (item.extensions?.inlined) item.extensions.inlined = result
		}
	})
	await NodeFS.writeFile(tokenListPath, JSON.stringify(tokenlist, null, 2))
})

export async function svgToUrlEncoded(filepath: string) {
	const normalizedPath = NodePath.normalize(filepath)

	const svgString = await NodeFS.readFile(normalizedPath, 'utf-8')

	return svgString
		.replace(
			'<svg',
			~svgString.indexOf('xmlns')
				? '<svg'
				: '<svg xmlns="http://www.w3.org/2000/svg"',
		)
		.replace(/"/g, "'")
		.replace(/%/g, '%25')
		.replace(/#/g, '%23')
		.replace(/{/g, '%7B')
		.replace(/}/g, '%7D')
		.replace(/</g, '%3C')
		.replace(/>/g, '%3E')
		.replace(/\s+/g, ' ')
		.replace(/&/g, '%26')
		.replace('|', '%7C')
		.replace('[', '%5B')
		.replace(']', '%5D')
		.replace('^', '%5E')
		.replace('`', '%60')
		.replace(';', '%3B')
		.replace('?', '%3F')
		.replace(':', '%3A')
		.replace('@', '%40')
		.replace('=', '%3D')
}
