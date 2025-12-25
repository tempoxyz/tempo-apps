import { createFileRoute } from '@tanstack/react-router'
import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import * as z from 'zod/mini'
import { ContractVerificationLookupSchema } from '#lib/domain/contract-source.ts'
import { zAddress } from '#lib/zod.ts'

const CONTRACT_VERIFICATION_API_BASE_URL =
	'https://contracts.tempo.xyz/v2/contract'

const SHIKI_THEMES = {
	light: 'github-light',
	dark: 'github-dark',
} satisfies Record<'light' | 'dark', string>

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
	sol: 'solidity',
	vy: 'vyper',
	rs: 'rust',
}

let highlighterPromise: Promise<HighlighterCore> | null = null

async function getHighlighter(): Promise<HighlighterCore> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighterCore({
			themes: [
				import('@shikijs/themes/github-light'),
				import('@shikijs/themes/github-dark'),
			],
			langs: [
				import('@shikijs/langs/solidity'),
				import('@shikijs/langs/vyper'),
				import('@shikijs/langs/json'),
				import('@shikijs/langs/rust'),
			],
			engine: createJavaScriptRegexEngine({ forgiving: true }),
		})
	}
	return highlighterPromise
}

function getLanguageFromFileName(fileName: string): string {
	return (
		EXTENSION_LANGUAGE_MAP[fileName.split('.').pop()?.toLowerCase() ?? ''] ??
		'solidity'
	)
}

async function processHighlightedHtml(html: string): Promise<string> {
	const response = new Response(html, {
		headers: { 'content-type': 'text/html' },
	})

	const rewriter = new HTMLRewriter()
		.on('pre', {
			element(element) {
				element.setAttribute('class', 'shiki-block')
				element.setAttribute('style', 'background-color: transparent')
			},
		})
		.on('code', {
			element(element) {
				element.setAttribute(
					'style',
					'display: block; padding: 0; background-color: transparent',
				)
			},
		})

	const transformed = rewriter.transform(response)
	return transformed.text()
}

export const Route = createFileRoute('/api/code')({
	server: {
		handlers: {
			GET: async (context) => {
				const url = new URL(context.request.url)

				const normalizedParams = Object.fromEntries(
					Array.from(url.searchParams.entries()).map(([k, v]) => [
						k.toLowerCase(),
						v,
					]),
				)
				const {
					data: parsedSearchParams,
					error: parsedSearchParamsError,
					success: parsedSearchParamsSuccess,
				} = z.safeParse(
					z.object({
						chainid: z.coerce.number(),
						address: zAddress({ lowercase: true }),
						highlight: z.prefault(z.coerce.boolean(), z.literal(false)),
					}),
					normalizedParams,
				)

				if (!parsedSearchParamsSuccess)
					return Response.json(
						{ error: z.prettifyError(parsedSearchParamsError) },
						{ status: 400 },
					)

				const apiUrl = new URL(
					`${CONTRACT_VERIFICATION_API_BASE_URL}/${parsedSearchParams.chainid}/${parsedSearchParams.address.toLowerCase()}`,
				)
				apiUrl.searchParams.set('fields', 'stdJsonInput,abi,compilation')
				const response = await fetch(apiUrl.toString())

				if (!response.ok)
					return Response.json(
						{ error: 'Failed to fetch contract code' },
						{ status: response.status },
					)

				const responseData = await response.json()

				const { data, success, error } = z.safeParse(
					ContractVerificationLookupSchema,
					responseData,
				)
				if (!success)
					return Response.json(
						{ error: z.prettifyError(error) },
						{ status: 500 },
					)

				// Cache for 1 day - verified contract source code doesn't change
				const cacheHeaders = {
					'Cache-Control':
						'public, max-age=86400, stale-while-revalidate=604800',
				}

				if (!parsedSearchParams.highlight)
					return Response.json(data, { headers: cacheHeaders })

				const highlighter = await getHighlighter()
				const highlightedSources: Record<
					string,
					{ content: string; highlightedHtml?: string }
				> = {}

				for (const [fileName, source] of Object.entries(
					data.stdJsonInput.sources,
				)) {
					const language = getLanguageFromFileName(fileName)
					try {
						const html = highlighter.codeToHtml(source.content, {
							lang: language,
							themes: SHIKI_THEMES,
							defaultColor: 'light-dark()',
						})
						highlightedSources[fileName] = {
							content: source.content,
							highlightedHtml: await processHighlightedHtml(html),
						}
					} catch (error) {
						console.error(`Failed to highlight ${fileName}:`, error)
						highlightedSources[fileName] = { content: source.content }
					}
				}

				return Response.json(
					{
						...data,
						stdJsonInput: {
							...data.stdJsonInput,
							sources: highlightedSources,
						},
					},
					{ headers: cacheHeaders },
				)
			},
		},
	},
})
