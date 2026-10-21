import { Hex } from 'ox'
import { color } from '#brand.tsx'

const TOKENLIST_ICON_URL = 'https://tokenlist.tempo.xyz/icon'

/** Bundled brand art as data URLs, ready for `img` sources. */
export interface Images {
	logo: string
	icons: {
		blocks: string
		tokens: string
		transactions: string
		search: string
	}
}

type Font = { name: string; data: ArrayBuffer; style: 'normal' }

// TDS ships both faces as variable fonts; Takumi maps every weight onto the
// `wght` axis, so one file per family covers 450, 500, 550 and 600.
const FONTS = [
	['Inter', 'Inter-Variable.woff2'],
	['Geist Mono', 'GeistMono-Variable.woff2'],
] as const

// TDS icons, painted in the card's colors.
const ICONS = [
	['blocks', 'Layers.svg', color.foreground],
	['tokens', 'Coins.svg', color.foreground],
	['transactions', 'Receipt.svg', color.foreground],
	['search', 'Search.svg', color.tertiary],
] as const

let fontCache: Font[] | null = null
let fontsInFlight: Promise<Font[]> | null = null
let imageCache: Images | null = null
let imagesInFlight: Promise<Images> | null = null

export const isTxHash = (value: string): boolean =>
	Hex.validate(value) && Hex.size(value as Hex.Hex) === 32

export const toBase64DataUrl = (
	data: ArrayBuffer,
	mime = 'image/webp',
): string => `data:${mime};base64,${Buffer.from(data).toString('base64')}`

async function asset(
	env: Cloudflare.Env,
	path: string,
	kind = 'asset',
): Promise<Response> {
	const response = await env.ASSETS.fetch(new Request(`https://assets/${path}`))
	if (!response.ok)
		throw new Error(`Failed to load ${kind} ${path}: ${response.status}`)
	return response
}

export async function loadFonts(env: Cloudflare.Env): Promise<Font[]> {
	if (fontCache) return fontCache
	if (!fontsInFlight) {
		fontsInFlight = Promise.all(
			FONTS.map(async ([name, file]) => ({
				name,
				style: 'normal' as const,
				data: await (await asset(env, `fonts/${file}`, 'font')).arrayBuffer(),
			})),
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

const svgDataUrl = (svg: string) =>
	`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

export async function loadImages(env: Cloudflare.Env): Promise<Images> {
	if (imageCache) return imageCache
	if (!imagesInFlight)
		imagesInFlight = Promise.all([
			asset(env, 'tempo-lockup.svg').then((response) => response.text()),
			Promise.all(
				ICONS.map(async ([name, file, fill]) => {
					const svg = await (await asset(env, `icons/${file}`)).text()
					return [
						name,
						svgDataUrl(svg.replaceAll('fill="black"', `fill="${fill}"`)),
					] as const
				}),
			),
		])
			.then(([logo, icons]) => {
				imageCache = {
					logo: svgDataUrl(logo),
					icons: Object.fromEntries(icons) as Images['icons'],
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
