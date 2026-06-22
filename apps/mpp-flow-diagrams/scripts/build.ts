import { build } from 'esbuild'

await build({
	entryPoints: ['src/client.ts'],
	outfile: 'public/app.js',
	bundle: true,
	format: 'esm',
	target: 'es2022',
	sourcemap: true,
	minify: false,
	logLevel: 'info',
})
