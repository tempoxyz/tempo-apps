import type * as Svgo from 'svgo'

const args = Bun.argv.slice(2)

export default {
	js2svg: { indent: 2, pretty: true },
	datauri: args.includes('--datauri') ? 'enc' : undefined,
	plugins: [
		'preset-default',
		'cleanupIds',
		'cleanupAttrs',
		'convertColors',
		'convertPathData',
		'convertTransform',
		'convertShapeToPath',
		'convertEllipseToCircle',
		'convertTransform',
		'cleanupEnableBackground',
		'cleanupNumericValues',
		'cleanupListOfValues',
		'cleanupNumericValues',
		'minifyStyles',
		'prefixIds',
		'removeComments',
		'removeDeprecatedAttrs',
		'removeScripts',
		'removeUselessDefs',
		'removeUselessStrokeAndFill',
	],
} satisfies Svgo.Config
