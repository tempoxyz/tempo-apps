import { Hex } from 'ox'

const TOKENLIST_ICON_URL = 'https://tokenlist.tempo.xyz/icon'

interface ImageCache {
	receiptRings: ArrayBuffer
	tempoLockup: ArrayBuffer
	nullIcon: ArrayBuffer
}

type Font = {
	name: string
	data: ArrayBuffer
	weight: 300 | 400 | 500 | 600
	style: 'normal'
}
let fontCache: Font[] | null = null
let fontsInFlight: Promise<Font[]> | null = null
let imageCache: ImageCache | null = null
let imagesInFlight: Promise<ImageCache> | null = null

export const isTxHash = (value: string): boolean =>
	Hex.validate(value) && Hex.size(value as Hex.Hex) === 32

export const toBase64DataUrl = (
	data: ArrayBuffer,
	mime = 'image/webp',
): string => `data:${mime};base64,${Buffer.from(data).toString('base64')}`

export async function loadFonts(env: Cloudflare.Env): Promise<Font[]> {
	if (fontCache) return fontCache
	if (!fontsInFlight) {
		fontsInFlight = Promise.all(
			[
				['Pilat', 'Pilat-Regular.woff2', 400],
				['Pilat', 'Pilat-Demi.woff2', 500],
				['Pilat', 'Pilat-Demi.woff2', 600],
				['JetBrains Mono', 'JetBrainsMono-Light.woff2', 300],
			].map(async ([name, file, weight]) => {
				const response = await env.ASSETS.fetch(
					new Request(`https://assets/fonts/${file}`),
				)
				if (!response.ok)
					throw new Error(`Failed to load font ${file}: ${response.status}`)
				return {
					name,
					weight,
					style: 'normal',
					data: await response.arrayBuffer(),
				} as Font
			}),
		)
			.then((fonts) => {
				fontCache = fonts
				return fonts
			})
			.finally(() => {
				fontsInFlight = null
			})
	}
	return fontsInFlight
}

export async function loadImages(env: Cloudflare.Env): Promise<ImageCache> {
	if (imageCache) return imageCache
	if (!imagesInFlight)
		imagesInFlight = Promise.all([
			env.ASSETS.fetch(new Request('https://assets/tempo-lockup.svg')),
			env.ASSETS.fetch(new Request('https://assets/null.webp')),
			env.ASSETS.fetch(new Request('https://assets/bg-template.webp')),
		])
			.then(async ([logo, icon, rings]) => {
				if (!logo.ok || !icon.ok || !rings.ok)
					throw new Error('Unable to load brand assets')
				imageCache = {
					receiptRings: await rings.arrayBuffer(),
					tempoLockup: await logo.arrayBuffer(),
					nullIcon: await icon.arrayBuffer(),
				}
				return imageCache
			})
			.finally(() => {
				imagesInFlight = null
			})
	return imagesInFlight
}

export async function fetchTokenIcon(
	address: string,
	chainId: number,
): Promise<string | null> {
	try {
		const response = await fetch(
			`${TOKENLIST_ICON_URL}/${chainId}/${address}`,
			{ cf: { cacheTtl: 3600 }, signal: AbortSignal.timeout(2500) },
		)
		if (!response.ok) return null
		const contentType = response.headers.get('content-type') || 'image/svg+xml'
		return toBase64DataUrl(await response.arrayBuffer(), contentType)
	} catch {
		return null
	}
}
