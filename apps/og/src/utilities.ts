import { Hex } from 'ox'

const TOKENLIST_ICON_URL = 'https://tokenlist.tempo.xyz/icon'

interface ImageCache {
	bgTx: ArrayBuffer
	bgToken: ArrayBuffer
	bgAddress: ArrayBuffer
	bgContract: ArrayBuffer
	bgReceipt: ArrayBuffer
	bgBlock: ArrayBuffer
	tempoLockup: ArrayBuffer
	tempoMark: ArrayBuffer
	nullIcon: ArrayBuffer
}

let fontCache: {
	mono: ArrayBuffer
	inter: ArrayBuffer
	pilat: ArrayBuffer
} | null = null
let fontsInFlight: Promise<{
	mono: ArrayBuffer
	inter: ArrayBuffer
	pilat: ArrayBuffer
}> | null = null
let imageCache: ImageCache | null = null
let imagesInFlight: Promise<ImageCache> | null = null

export const isTxHash = (value: string): boolean =>
	Hex.validate(value) && Hex.size(value as Hex.Hex) === 32

export const toBase64DataUrl = (
	data: ArrayBuffer,
	mime = 'image/webp',
): string => `data:${mime};base64,${Buffer.from(data).toString('base64')}`

export async function loadFonts(env: Cloudflare.Env) {
	if (fontCache) return fontCache
	if (!fontsInFlight) {
		const loadFont = async (name: string) => {
			const response = await env.ASSETS.fetch(
				new Request(`https://assets/fonts/${name}`),
			)
			if (!response.ok)
				throw new Error(`Failed to load font ${name}: ${response.status}`)
			return response.arrayBuffer()
		}
		fontsInFlight = Promise.all([
			loadFont('GeistMono-Regular.woff2'),
			loadFont('inter-latin-500-normal.woff2'),
			loadFont('Pilat-Book.otf'),
		])
			.then(([mono, inter, pilat]) => {
				fontCache = { mono, inter, pilat }
				return fontCache
			})
			.finally(() => {
				// A transient asset failure must not poison subsequent requests.
				fontsInFlight = null
			})
	}
	return fontsInFlight
}

export async function loadImages(env: Cloudflare.Env): Promise<ImageCache> {
	if (imageCache) return imageCache
	if (!imagesInFlight) {
		imagesInFlight = (async () => {
			const [
				bgTx,
				bgToken,
				bgAddress,
				bgContract,
				bgReceipt,
				bgBlock,
				tempoLockup,
				tempoMark,
				nullIcon,
			] = await Promise.all([
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
					new Request('https://assets/bg-template-receipt.webp'),
				).then((response: Response) => response.arrayBuffer()),
				env.ASSETS.fetch(
					new Request('https://assets/bg-template-blocks.webp'),
				).then((response: Response) => response.arrayBuffer()),
				env.ASSETS.fetch(new Request('https://assets/tempo-lockup.svg')).then(
					(response: Response) => response.arrayBuffer(),
				),
				env.ASSETS.fetch(new Request('https://assets/tempo-mark.webp')).then(
					(response: Response) => response.arrayBuffer(),
				),
				env.ASSETS.fetch(new Request('https://assets/null.webp')).then(
					(response: Response) => response.arrayBuffer(),
				),
			])
			imageCache = {
				bgTx,
				bgToken,
				bgAddress,
				bgContract,
				bgReceipt,
				bgBlock,
				tempoLockup,
				tempoMark,
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
