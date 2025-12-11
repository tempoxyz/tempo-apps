import { ImageResponse } from '@takumi-rs/image-response/wasm'
import module from '@takumi-rs/wasm/takumi_wasm_bg.wasm'

const FONT_URL =
	'https://unpkg.com/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2'

const devicePixelRatio = 1.0

export default {
	fetch: async (request) => {
		const url = new URL(request.url)
		const { searchParams, pathname } = url

		if (pathname.endsWith('favicon.ico'))
			return Response.redirect('https://docs.tempo.xyz/icon-light.png')

		const title = searchParams.get('title')
		const theme = searchParams.get('theme')
		const description = searchParams.get('description')

		if (!title || !description || !theme)
			return new Response('Bad Request', { status: 400 })

		const fontData = await fetch(FONT_URL).then((res) => res.arrayBuffer())

		return new ImageResponse(
			<div
				tw={`size-full min-w-full flex flex-col items-center justify-center ${theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'}`}
			>
				<img
					alt="tempo"
					tw="w-92"
					src="https://raw.githubusercontent.com/tempoxyz/.github/refs/heads/main/assets/combomark-dark.svg"
				/>
				<h1 tw="text-9xl font-bold">{title}</h1>
				<p tw="text-2xl">{description}</p>
			</div>,
			{
				width: 1200 * devicePixelRatio,
				height: 630 * devicePixelRatio,
				format: 'webp',
				module,
				fonts: [
					{
						weight: 400,
						name: 'Inter',
						data: fontData,
						style: 'normal',
					},
				],
			},
		)
	},
} satisfies ExportedHandler<Cloudflare.Env>
