import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Connector } from 'wagmi'
import {
	discoverInjectedConnectors,
	getStoredWalletId,
	persistSelectedWalletId,
	prioritizeStoredWallet,
	selectedWalletStorageKey,
	switchInjectedWallet,
} from '#lib/wallets'

afterEach(() => {
	vi.unstubAllGlobals()
})

function connector(
	id: string,
	name = id,
	provider: object | null = {},
): Connector {
	return {
		id,
		name,
		uid: `${id}-uid`,
		getProvider: async () => provider,
	} as Connector
}

describe('injected wallet selection', () => {
	it('handles zero available providers', async () => {
		expect(
			await discoverInjectedConnectors([
				connector('injected', 'Injected', null),
			]),
		).toEqual([])
	})

	it('retains the legacy window.ethereum fallback when it is the only provider', async () => {
		const legacy = connector('injected', 'Injected')

		expect(await discoverInjectedConnectors([legacy])).toEqual([legacy])
	})

	it('returns every identified provider without the ambiguous legacy duplicate', async () => {
		const legacy = connector('injected', 'Injected')
		const metamask = connector('io.metamask', 'MetaMask')
		const core = connector('app.core', 'Core')

		expect(await discoverInjectedConnectors([legacy, metamask, core])).toEqual([
			metamask,
			core,
		])
	})

	it('keeps the legacy fallback alongside the configured Tempo wallet', async () => {
		const tempo = connector('xyz.tempo', 'Tempo')
		const legacy = connector('injected', 'Injected')

		expect(await discoverInjectedConnectors([tempo, legacy])).toEqual([
			tempo,
			legacy,
		])
	})

	it('persists and prioritizes the selected provider', () => {
		const values = new Map<string, string>()
		vi.stubGlobal('window', {
			localStorage: {
				getItem: (key: string) => values.get(key) ?? null,
				setItem: (key: string, value: string) => values.set(key, value),
			},
		})
		const metamask = connector('io.metamask', 'MetaMask')
		const core = connector('app.core', 'Core')

		persistSelectedWalletId(core.id)

		expect(values.get(selectedWalletStorageKey)).toBe(core.id)
		expect(getStoredWalletId()).toBe(core.id)
		expect(
			prioritizeStoredWallet([metamask, core], getStoredWalletId()),
		).toEqual([core, metamask])
	})

	it('connects a new provider without dropping the active provider first', async () => {
		const values = new Map<string, string>()
		vi.stubGlobal('window', {
			localStorage: {
				setItem: (key: string, value: string) => values.set(key, value),
			},
		})
		const calls: string[] = []
		const metamask = connector('io.metamask', 'MetaMask')
		const core = connector('app.core', 'Core')

		await switchInjectedWallet({
			connector: core,
			currentConnector: metamask,
			connectedConnectors: [metamask],
			connect: async (next) => {
				calls.push(`connect:${next.id}`)
			},
			switchConnection: async (next) => {
				calls.push(`switch:${next.id}`)
			},
		})

		expect(calls).toEqual(['connect:app.core'])
		expect(values.get(selectedWalletStorageKey)).toBe(core.id)
	})

	it('switches to an already connected provider without reconnecting', async () => {
		const values = new Map<string, string>()
		vi.stubGlobal('window', {
			localStorage: {
				setItem: (key: string, value: string) => values.set(key, value),
			},
		})
		const calls: string[] = []
		const metamask = connector('io.metamask', 'MetaMask')
		const core = connector('app.core', 'Core')

		await switchInjectedWallet({
			connector: core,
			currentConnector: metamask,
			connectedConnectors: [metamask, core],
			connect: async (next) => {
				calls.push(`connect:${next.id}`)
			},
			switchConnection: async (next) => {
				calls.push(`switch:${next.id}`)
			},
		})

		expect(calls).toEqual(['switch:app.core'])
		expect(values.get(selectedWalletStorageKey)).toBe(core.id)
	})
})
