#!/usr/bin/env node --experimental-strip-types
/**
 * Scaffold a new Tempo app from the _template
 *
 * Usage:
 *   node --experimental-strip-types scripts/create-app.ts my-app
 *   pnpm create-app my-app
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const TEMPLATE_DIR = 'apps/_template'
const APPS_DIR = 'apps'

function main() {
	const appName = process.argv[2]

	if (!appName) {
		console.error('Usage: pnpm create-app <app-name>')
		console.error('Example: pnpm create-app my-awesome-app')
		process.exit(1)
	}

	// Validate app name
	if (!/^[a-z][a-z0-9-]*$/.test(appName)) {
		console.error('Error: App name must be lowercase, start with a letter, and contain only letters, numbers, and hyphens')
		process.exit(1)
	}

	if (appName.startsWith('_')) {
		console.error('Error: App name cannot start with underscore')
		process.exit(1)
	}

	const targetDir = join(APPS_DIR, appName)

	if (existsSync(targetDir)) {
		console.error(`Error: Directory ${targetDir} already exists`)
		process.exit(1)
	}

	if (!existsSync(TEMPLATE_DIR)) {
		console.error(`Error: Template directory ${TEMPLATE_DIR} not found`)
		process.exit(1)
	}

	console.log(`Creating new app: ${appName}`)
	console.log(`Target directory: ${targetDir}`)
	console.log('')

	// Copy template directory
	copyDir(TEMPLATE_DIR, targetDir)

	// Replace _template with app name in all files
	replaceInDir(targetDir, '_template', appName)

	console.log('✓ Created app directory')
	console.log('✓ Copied template files')
	console.log('✓ Updated app name in files')
	console.log('')
	console.log('Next steps:')
	console.log(`  1. cd ${targetDir}`)
	console.log('  2. pnpm install')
	console.log('  3. pnpm dev')
	console.log('')
	console.log('To deploy:')
	console.log('  pnpm deploy --env moderato')
	console.log('')
	console.log('Remember to:')
	console.log(`  - Update routes in wrangler.jsonc (replace ${appName}.*.tempo.xyz)`)
	console.log('  - Add app to CI matrix in .github/workflows/main.yml')
	console.log('  - Add app to README.md table')
}

function copyDir(src: string, dest: string) {
	mkdirSync(dest, { recursive: true })

	for (const entry of readdirSync(src)) {
		const srcPath = join(src, entry)
		const destPath = join(dest, entry)

		if (statSync(srcPath).isDirectory()) {
			copyDir(srcPath, destPath)
		} else {
			copyFileSync(srcPath, destPath)
		}
	}
}

function replaceInDir(dir: string, search: string, replace: string) {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)

		if (statSync(path).isDirectory()) {
			replaceInDir(path, search, replace)
		} else {
			const content = readFileSync(path, 'utf-8')
			if (content.includes(search)) {
				writeFileSync(path, content.replaceAll(search, replace))
			}
		}
	}
}

main()
