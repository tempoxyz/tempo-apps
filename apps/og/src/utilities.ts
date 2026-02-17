import { Hex } from 'ox'

const FONT_MONO_URL =
	'https://unpkg.com/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2'
const FONT_INTER_URL =
	'https://unpkg.com/@fontsource/inter/files/inter-latin-500-normal.woff2'
const TOKENLIST_ICON_URL = 'https://tokenlist.tempo.xyz/icon'

interface ImageCache {
	bgTx: ArrayBuffer
	bgToken: ArrayBuffer
	bgAddress: ArrayBuffer
	bgContract: ArrayBuffer
	receiptLogo: ArrayBuffer
	nullIcon: ArrayBuffer
}

let fontCache: { mono: ArrayBuffer; inter: ArrayBuffer } | null = null
let fontsInFlight: Promise<{ mono: ArrayBuffer; inter: ArrayBuffer }> | null =
	null
let imageCache: ImageCache | null = null
let imagesInFlight: Promise<ImageCache> | null = null

export const isTxHash = (value: string): boolean =>
	Hex.validate(value) && Hex.size(value as Hex.Hex) === 32

export const toBase64DataUrl = (
	data: ArrayBuffer,
	mime = 'image/webp',
): string => `data:${mime};base64,${Buffer.from(data).toString('base64')}`

export async function loadFonts() {
	if (fontCache) return fontCache
	if (!fontsInFlight) {
		fontsInFlight = Promise.all([
			fetch(FONT_MONO_URL).then((response: Response) => response.arrayBuffer()),
			fetch(FONT_INTER_URL).then((response: Response) =>
				response.arrayBuffer(),
			),
		]).then(([mono, inter]) => {
			fontCache = { mono, inter }
			fontsInFlight = null
			return fontCache
		})
	}
	return fontsInFlight
}

export async function loadImages(env: Cloudflare.Env): Promise<ImageCache> {
	if (imageCache) return imageCache
	if (!imagesInFlight) {
		imagesInFlight = (async () => {
			const [bgTx, bgToken, bgAddress, bgContract, receiptLogo, nullIcon] =
				await Promise.all([
					env.ASSETS.fetch(
						new Request('https://assets/bg-template-transaction.webp'),
					).then((response: Response) => response.arrayBuffer()),
					env.ASSETS.fetch(
						new Request('https://assets/bg-template-token.webp'),
					).then((response: Response) => response.arrayBuffer()),
					env.ASSETS.fetch(
						new Request('https://assets/bg-template-address.webp'),
					).then((response: Response) => response.arrayBuffer()),
					env.ASSETS.fetch(
						new Request('https://assets/bg-template-contract.webp'),
					).then((response: Response) => response.arrayBuffer()),
					env.ASSETS.fetch(
						new Request('https://assets/tempo-receipt.webp'),
					).then((response: Response) => response.arrayBuffer()),
					env.ASSETS.fetch(new Request('https://assets/null.webp')).then(
						(response: Response) => response.arrayBuffer(),
					),
				])
			imageCache = {
				bgTx,
				bgToken,
				bgAddress,
				bgContract,
				receiptLogo,
				nullIcon,
			}
			imagesInFlight = null
			return imageCache
		})()
	}
	return imagesInFlight
}

export async function fetchTokenIcon(
	address: string,
	chainId: number,
): Promise<string | null> {
	try {
		const response = await fetch(
			`${TOKENLIST_ICON_URL}/${chainId}/${address}`,
			{ cf: { cacheTtl: 3600 } },
		)
		if (!response.ok) return null
		const contentType = response.headers.get('content-type') || 'image/svg+xml'
		return toBase64DataUrl(await response.arrayBuffer(), contentType)
	} catch {
		return null
	}
}
