import { resolve } from 'node:path'

export function accountsAliases() {
	const repo = process.env.ACCOUNTS_REPO
	if (!repo) return []

	const viem = resolve(repo, 'node_modules/viem')
	const ox = resolve(repo, 'node_modules/ox')
	return [
		{
			find: 'accounts/server',
			replacement: resolve(repo, 'src/server/index.ts'),
		},
		{ find: /^viem\/(.*)$/, replacement: `${viem}/$1` },
		{ find: 'viem', replacement: viem },
		{ find: /^ox\/(.*)$/, replacement: `${ox}/$1` },
		{ find: 'ox', replacement: ox },
	]
}
