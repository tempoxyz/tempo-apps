import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { ChainRegistry } from '#lib/chain-registry.ts'
import { staticChains } from '#wagmi.config.ts'

const FAKE_REGISTRY_URL = 'https://fake-registry.test/chains'

function makeFakeResponse(
	chains: Record<
		string,
		{
			chainId: number
			rpc: string[]
			hidden?: boolean
			name?: string
			nativeCurrency?: { name: string; symbol: string; decimals: number }
			explorers?: Array<{ name: string; url: string; standard?: string }>
		}
	>,
) {
	return new Response(JSON.stringify(chains), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

describe('ChainRegistry', () => {
	const originalFetch = globalThis.fetch
	let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>

	beforeEach(() => {
		mockFetch = vi.fn<typeof fetch>()
		globalThis.fetch = mockFetch
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	describe('fromStatic', () => {
		it('creates a registry with only static chains', () => {
			const registry = ChainRegistry.fromStatic(staticChains)

			for (const chain of staticChains) {
				expect(registry.isSupported(chain.id)).toBe(true)
				expect(registry.getChain(chain.id)).toBeDefined()
				expect(registry.isHidden(chain.id)).toBe(false)
			}

			expect(registry.isSupported(999999)).toBe(false)
			expect(registry.getChain(999999)).toBeUndefined()
		})

		it('returns sourcify chains for all static chains', () => {
			const registry = ChainRegistry.fromStatic(staticChains)
			const sourcify = registry.getSourcifyChains()

			expect(sourcify).toHaveLength(staticChains.length)
			for (const chain of staticChains) {
				expect(sourcify.some((s) => s.chainId === chain.id)).toBe(true)
			}
		})
	})

	describe('fromUrl', () => {
		it('fetches and merges dynamic chains with static chains', async () => {
			mockFetch.mockResolvedValue(
				makeFakeResponse({
					'42161': {
						chainId: 42161,
						rpc: ['https://arb1.arbitrum.io/rpc'],
						name: 'Arbitrum One',
					},
				}),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			// static chains still present
			for (const chain of staticChains) {
				expect(registry.isSupported(chain.id)).toBe(true)
			}

			// dynamic chain added
			expect(registry.isSupported(42161)).toBe(true)
			const chain = registry.getChain(42161)
			expect(chain).toBeDefined()
			expect(chain?.name).toBe('Arbitrum One')
			expect(chain?.rpcUrls.default.http).toContain(
				'https://arb1.arbitrum.io/rpc',
			)
		})

		it('sends Authorization header when authToken is provided', async () => {
			mockFetch.mockResolvedValue(makeFakeResponse({}))

			await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				authToken: 'test-secret-token',
				staticChains,
			})

			expect(mockFetch).toHaveBeenCalledOnce()
			const callHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Headers
			expect(callHeaders.get('Authorization')).toBe('Bearer test-secret-token')
		})

		it('does not send Authorization header when authToken is not provided', async () => {
			mockFetch.mockResolvedValue(makeFakeResponse({}))

			await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			expect(mockFetch).toHaveBeenCalledOnce()
			const callHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Headers
			expect(callHeaders.has('Authorization')).toBe(false)
		})

		it('hidden chains are functional but excluded from getSourcifyChains', async () => {
			mockFetch.mockResolvedValue(
				makeFakeResponse({
					'10': {
						chainId: 10,
						rpc: ['https://mainnet.optimism.io'],
						name: 'Optimism',
						hidden: true,
					},
					'42161': {
						chainId: 42161,
						rpc: ['https://arb1.arbitrum.io/rpc'],
						name: 'Arbitrum One',
						hidden: false,
					},
				}),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			// both chains are functional
			expect(registry.isSupported(10)).toBe(true)
			expect(registry.isSupported(42161)).toBe(true)
			expect(registry.getChain(10)).toBeDefined()
			expect(registry.getChain(42161)).toBeDefined()

			// hidden flag
			expect(registry.isHidden(10)).toBe(true)
			expect(registry.isHidden(42161)).toBe(false)

			// sourcify chains exclude hidden
			const sourcify = registry.getSourcifyChains()
			expect(sourcify.some((s) => s.chainId === 10)).toBe(false)
			expect(sourcify.some((s) => s.chainId === 42161)).toBe(true)
		})

		it('static chains take precedence over dynamic chains with same ID', async () => {
			const staticChain = staticChains[0]
			if (!staticChain) throw new Error('Expected at least one static chain')
			mockFetch.mockResolvedValue(
				makeFakeResponse({
					[String(staticChain.id)]: {
						chainId: staticChain.id,
						rpc: ['https://should-not-override.example.com'],
						name: 'Override Attempt',
					},
				}),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			const chain = registry.getChain(staticChain.id)
			expect(chain).toBeDefined()
			// should keep the static chain's name, not the override
			expect(chain?.name).toBe(staticChain.name)
			expect(chain?.rpcUrls.default.http).not.toContain(
				'https://should-not-override.example.com',
			)
		})

		it('falls back to static-only registry on fetch failure', async () => {
			mockFetch.mockResolvedValue(
				new Response('Internal Server Error', { status: 500 }),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			// static chains still work
			for (const chain of staticChains) {
				expect(registry.isSupported(chain.id)).toBe(true)
			}

			// no dynamic chains
			expect(registry.isSupported(42161)).toBe(false)
		})

		it('falls back to static-only registry on network error', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			for (const chain of staticChains) {
				expect(registry.isSupported(chain.id)).toBe(true)
			}
			expect(registry.isSupported(42161)).toBe(false)
		})

		it('rejects entries with invalid schema (missing rpc)', async () => {
			mockFetch.mockResolvedValue(
				new Response(
					JSON.stringify({
						'42161': { chainId: 42161 }, // missing rpc
						'10': {
							chainId: 10,
							rpc: ['https://mainnet.optimism.io'],
						},
					}),
					{ status: 200 },
				),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			// entire response fails validation because of the invalid entry
			// registry falls back to static only
			for (const chain of staticChains) {
				expect(registry.isSupported(chain.id)).toBe(true)
			}
		})

		it('rejects entries with empty rpc array', async () => {
			mockFetch.mockResolvedValue(
				makeFakeResponse({
					'42161': {
						chainId: 42161,
						rpc: [],
					},
				}),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			// entire response fails Zod validation (rpc must have minLength 1)
			for (const chain of staticChains) {
				expect(registry.isSupported(chain.id)).toBe(true)
			}
		})

		it('filters out websocket-only rpc entries', async () => {
			mockFetch.mockResolvedValue(
				makeFakeResponse({
					'42161': {
						chainId: 42161,
						rpc: ['wss://arb1.arbitrum.io/ws'],
					},
				}),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			// chain should not be added (no HTTP RPC URLs)
			expect(registry.isSupported(42161)).toBe(false)
		})

		it('defaults name and nativeCurrency when not provided', async () => {
			mockFetch.mockResolvedValue(
				makeFakeResponse({
					'42161': {
						chainId: 42161,
						rpc: ['https://arb1.arbitrum.io/rpc'],
					},
				}),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			const chain = registry.getChain(42161)
			expect(chain).toBeDefined()
			expect(chain?.name).toBe('Chain 42161')
			expect(chain?.nativeCurrency).toEqual({
				name: 'Ether',
				symbol: 'ETH',
				decimals: 18,
			})
		})

		it('returns sourcify-compliant shape for dynamic chains', async () => {
			mockFetch.mockResolvedValue(
				makeFakeResponse({
					'42161': {
						chainId: 42161,
						rpc: ['https://arb1.arbitrum.io/rpc'],
						name: 'Arbitrum One',
						explorers: [
							{
								name: 'Arbiscan',
								url: 'https://arbiscan.io',
								standard: 'EIP3091',
							},
						],
					},
				}),
			)

			const registry = await ChainRegistry.fromUrl({
				url: FAKE_REGISTRY_URL,
				staticChains,
			})

			const sourcify = registry.getSourcifyChains()
			const arb = sourcify.find((s) => s.chainId === 42161)
			expect(arb).toBeDefined()
			expect(arb).toMatchObject({
				name: 'Arbitrum One',
				title: 'Arbitrum One',
				chainId: 42161,
				rpc: ['https://arb1.arbitrum.io/rpc'],
				traceSupportedRPCs: [],
				supported: true,
				etherscanAPI: false,
			})
		})
	})

	describe('isHidden', () => {
		it('returns false for unknown chain IDs', () => {
			const registry = ChainRegistry.fromStatic(staticChains)
			expect(registry.isHidden(999999)).toBe(false)
		})
	})
})
