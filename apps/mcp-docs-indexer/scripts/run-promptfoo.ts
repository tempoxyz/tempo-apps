import { spawn } from 'node:child_process'

const env = Object.fromEntries(
	Object.entries(process.env).filter(([key]) => !key.startsWith('npm_config_')),
) as NodeJS.ProcessEnv

const child = spawn(
	'npx',
	[
		'--userconfig=/dev/null',
		'-y',
		'promptfoo@0.121.15',
		'eval',
		'--config',
		'promptfooconfig.ts',
		'--no-progress-bar',
		'--no-cache',
		...process.argv.slice(2),
	],
	{ env, stdio: 'inherit' },
)

child.on('exit', (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal)
		return
	}
	process.exitCode = code ?? 1
})
