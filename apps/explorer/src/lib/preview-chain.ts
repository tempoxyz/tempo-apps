import { createIsomorphicFn } from '@tanstack/react-start'
import { tempoDevnet } from 'viem/chains'

declare global {
	interface Window {
		__TEMPO_PREVIEW__: { chainId: number }
	}
}

const getChainId = createIsomorphicFn()
	.client(() => window.__TEMPO_PREVIEW__?.chainId)
	.server(() => Number(process.env.PREVIEW_CHAIN_ID))

export function getPreviewChain() {
	const id = getChainId()
	if (!Number.isSafeInteger(id) || id <= 0 || [4217, 42431].includes(id))
		throw new Error('Preview chain is not configured')
	return {
		...tempoDevnet,
		id,
		name: 'Tempo Preview',
		rpcUrls: { default: { http: ['/api/rpc'] } },
	}
}
