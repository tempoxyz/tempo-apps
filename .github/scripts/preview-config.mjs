// Writes the Wrangler config that preview.yml uploads a pull request's preview
// with. Everything that names the Worker or grants access (name, bindings,
// variables, compatibility settings, routes) comes from main's config for the
// app. Only the module and asset paths point at the pull request's build, which
// the upload treats as data: Wrangler bundles nothing and runs none of its code.
//
// Usage: node preview-config.mjs <main's wrangler.json> <preview directory> <output>
import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

const [configPath, previewDirectory, outputPath] = process.argv.slice(2)
if (!configPath || !previewDirectory || !outputPath) {
	throw new Error(
		'usage: preview-config.mjs <wrangler.json> <preview directory> <output>',
	)
}
// Wrangler follows symbolic links when it reads modules and assets, so a link
// in the pull request's files could upload bytes from this runner. Accept only
// directories and regular files.
;(function verify(directory) {
	for (const entry of readdirSync(directory)) {
		const path = join(directory, entry)
		const stat = lstatSync(path)
		if (stat.isDirectory()) verify(path)
		else if (!stat.isFile())
			throw new Error(`the preview holds a link or special file: ${path}`)
	}
})(resolve(previewDirectory))

const config = JSON.parse(readFileSync(configPath, 'utf8'))
const worker = resolve(previewDirectory, 'worker')
const main = resolve(worker, 'index.js')
if (!lstatSync(main).isFile())
	throw new Error('the preview has no worker/index.js')

// Keys that change how Wrangler finds or builds the modules, which the
// pull request's build already did. An environment may not override them.
const buildKeys = [
	'main',
	'no_bundle',
	'find_additional_modules',
	'base_dir',
	'rules',
	'build',
	'alias',
	'define',
	'minify',
	'tsconfig',
]
for (const environment of Object.values(config.env ?? {})) {
	for (const key of buildKeys) delete environment[key]
}
config.main = main
config.no_bundle = true
config.find_additional_modules = true
config.base_dir = worker
// The module types Wrangler's dry run emits for these apps: ES modules
// (including Vite's chunks) and compiled Wasm (og's renderer).
config.rules = [
	{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] },
	{ type: 'CompiledWasm', globs: ['**/*.wasm'] },
]
for (const key of buildKeys.slice(5)) delete config[key]

// Static assets keep main's binding and routing settings. Vite apps declare
// none in wrangler.json, so the plugin's emitted directory is all they set.
const assets = resolve(previewDirectory, 'assets')
const hasAssets = existsSync(assets) && lstatSync(assets).isDirectory()
for (const scope of [config, ...Object.values(config.env ?? {})]) {
	if (scope.assets !== undefined) {
		if (!hasAssets)
			throw new Error("main's config declares assets, but the preview has none")
		scope.assets = { ...scope.assets, directory: assets }
	}
}
if (hasAssets && config.assets === undefined)
	config.assets = { directory: assets }

writeFileSync(outputPath, `${JSON.stringify(config, null, '\t')}\n`)
