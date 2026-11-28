import { spawnSync } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../scripts/build.sh', import.meta.url))
const directories: string[] = []

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true })
})

// Lays out dist/client as the Cloudflare Vite plugin leaves it, then runs
// build.sh there with `pnpm` shadowed, so no build runs.
function build(files: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), 'explorer-build-'))
	directories.push(root)
	for (const [name, content] of Object.entries(files)) {
		const path = join(root, 'dist/client', name)
		mkdirSync(join(path, '..'), { recursive: true })
		writeFileSync(path, content)
	}
	const result = spawnSync(
		'bash',
		['-c', 'pnpm() { :; }; source "$0"', script],
		{
			cwd: root,
			env: { PATH: process.env.PATH, CLOUDFLARE_ENV: 'testnet' },
			encoding: 'utf8',
		},
	)
	const exists = (name: string) => existsSync(join(root, 'dist/client', name))
	return { result, exists }
}

describe('build.sh', () => {
	it('removes the Vite plugin .assetsignore and the font notes', () => {
		const { result, exists } = build({
			'.assetsignore': 'wrangler.json\n.dev.vars\n',
			'fonts/pilat/README.md': '# Pilat',
			'fonts/pilat/Pilat-Book.woff2': '',
			'fonts/jetbrains-mono/README.md': '# JetBrains Mono',
			'fonts/jetbrains-mono/OFL.txt': 'license',
			'robots.txt': '',
		})
		expect(result.status).toBe(0)
		expect(exists('.assetsignore')).toBe(false)
		expect(exists('fonts/pilat/README.md')).toBe(false)
		expect(exists('fonts/jetbrains-mono/README.md')).toBe(false)
		expect(exists('fonts/pilat/Pilat-Book.woff2')).toBe(true)
		expect(exists('fonts/jetbrains-mono/OFL.txt')).toBe(true)
		expect(exists('robots.txt')).toBe(true)
	})

	it('fails when a file .assetsignore lists is in dist/client', () => {
		const { result, exists } = build({
			'.assetsignore': 'wrangler.json\n.dev.vars\n',
			'wrangler.json': '{}',
		})
		expect(result.status).toBe(1)
		expect(result.stderr).toContain('dist/client/wrangler.json')
		expect(exists('.assetsignore')).toBe(true)
	})
})
