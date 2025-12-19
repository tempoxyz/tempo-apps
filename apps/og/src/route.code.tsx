import ImageResponse from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'
import { Hono } from 'hono'
import { DEVICE_PIXEL_RATIO } from '#ui.tsx'
import { loadFonts } from '#utilities.ts'

const codeApp = new Hono<{ Bindings: Cloudflare.Env }>()

const baseStyle = { fontFamily: 'FontWithASyntaxHighlighterNightOwl-Regular' }

codeApp.get('/', async (context) => {
	const code = context.req.query('code')

	if (!code) return context.json({ error: 'No code provided' }, 400)

	const { syntaxHighlighting: syntaxHighlightingFont } = await loadFonts()

	const imageResponse = new ImageResponse(
		<div
			style={{
				...baseStyle,
				fontSize: '16px',
			}}
		>
			<pre
				class="antialiased"
				style={{
					...baseStyle,
					whiteSpace: 'pre-wrap',
				}}
			>
				<code>{code}</code>
			</pre>
		</div>,
		{
			width: 1200 * DEVICE_PIXEL_RATIO,
			height: 630 * DEVICE_PIXEL_RATIO,
			devicePixelRatio: DEVICE_PIXEL_RATIO,
			format: 'png',
			module,
			fonts: [
				{
					weight: 400,
					data: syntaxHighlightingFont,
					name: 'FontWithASyntaxHighlighterNightOwl-Regular',
				},
			],
		},
	)
	return new Response(imageResponse.body, {
		headers: { 'Content-Type': 'image/png' },
	})
})

export { codeApp }
