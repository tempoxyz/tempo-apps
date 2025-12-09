import type { Address } from 'ox'

export type ContractSourceFile = {
	fileName: string
	content: string
}

type SauceSourcesResponse = {
	sources?: Record<string, { content?: string | null } | undefined>
}

const CONTRACT_VERIFICATION_API_BASE_URL = import.meta.env
	.VITE_CONTRACT_VERIFICATION_URL
	? `${import.meta.env.VITE_CONTRACT_VERIFICATION_URL}/v2/contract`
	: 'https://sauce.up.railway.app/v2/contract'

/**
 * Fetch verified contract sources from Sauce registry.
 * Returns undefined when the contract is not verified or a network error occurs.
 */
export async function fetchContractSources(params: {
	address: Address.Address
	chainId: number
	signal?: AbortSignal
}): Promise<ContractSourceFile[] | undefined> {
	const { address, chainId, signal } = params

	if (!chainId) return undefined

	try {
		const url = new URL(
			`${CONTRACT_VERIFICATION_API_BASE_URL}/${chainId}/${address.toLowerCase()}`,
		)
		url.searchParams.set('fields', 'sources')

		const response = await fetch(url, {
			method: 'GET',
			headers: { accept: 'application/json' },
			signal,
		})

		if (!response.ok) return undefined

		const data = (await response.json()) as SauceSourcesResponse
		const files = Object.entries(data.sources ?? {}).map(
			([fileName, details]) => ({
				fileName,
				content: (details?.content ?? '').trimEnd(),
			}),
		)

		const nonEmptyFiles = files.filter((file) => file.content.length > 0)
		if (nonEmptyFiles.length === 0) return undefined

		return nonEmptyFiles.sort((a, b) => a.fileName.localeCompare(b.fileName))
	} catch (error) {
		console.error('Failed to fetch contract sources:', error)
		return undefined
	}
}
