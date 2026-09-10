import type { Connector } from 'wagmi'

const UNSUPPORTED_WALLET_IDS = new Set(['app.phantom'])
const UNSUPPORTED_WALLET_NAMES = new Set(['Phantom'])
export const selectedWalletStorageKey = 'tempo-explorer-selected-wallet'

export function filterSupportedInjectedConnectors(
	connectors: readonly Connector[],
) {
	return connectors.filter(
		(connector) =>
			connector.id !== 'webAuthn' &&
			!UNSUPPORTED_WALLET_IDS.has(connector.id) &&
			!UNSUPPORTED_WALLET_NAMES.has(connector.name),
	)
}

export function getSelectableInjectedConnectors(
	connectors: readonly Connector[],
): Connector[] {
	const supported = filterSupportedInjectedConnectors(connectors)
	const hasIdentifiedProvider = supported.some(
		(connector) => connector.id !== 'injected' && connector.id !== 'xyz.tempo',
	)

	return supported.filter(
		(connector) => !hasIdentifiedProvider || connector.id !== 'injected',
	)
}

export async function discoverInjectedConnectors(
	connectors: readonly Connector[],
): Promise<Connector[]> {
	const available = await Promise.all(
		connectors.map(async (connector) => {
			try {
				return (await connector.getProvider()) ? connector : undefined
			} catch {
				return undefined
			}
		}),
	)

	return getSelectableInjectedConnectors(
		available.filter((connector) => connector !== undefined),
	)
}

export function getStoredWalletId(): string | undefined {
	if (typeof window === 'undefined') return undefined

	try {
		return window.localStorage.getItem(selectedWalletStorageKey) ?? undefined
	} catch {
		return undefined
	}
}

export function persistSelectedWalletId(id: string): void {
	try {
		window.localStorage.setItem(selectedWalletStorageKey, id)
	} catch {
		// The selection still applies for the current connection.
	}
}

export function prioritizeStoredWallet(
	connectors: readonly Connector[],
	storedWalletId: string | undefined,
): Connector[] {
	return [...connectors].sort((a, b) => {
		if (a.id === storedWalletId) return -1
		if (b.id === storedWalletId) return 1
		if (a.id === 'xyz.tempo') return -1
		if (b.id === 'xyz.tempo') return 1
		return 0
	})
}

export async function switchInjectedWallet(options: {
	connector: Connector
	currentConnector?: Connector | undefined
	connectedConnectors: readonly Connector[]
	connect: (connector: Connector) => Promise<void>
	switchConnection: (connector: Connector) => Promise<void>
}): Promise<void> {
	const {
		connector,
		currentConnector,
		connectedConnectors,
		connect,
		switchConnection,
	} = options

	if (currentConnector?.uid === connector.uid) return
	if (connectedConnectors.some((connected) => connected.uid === connector.uid))
		await switchConnection(connector)
	else await connect(connector)

	persistSelectedWalletId(connector.id)
}

export function supportsWatchAsset(
	connector: Connector | undefined | null,
): boolean {
	return (
		!!connector &&
		connector.id !== 'webAuthn' &&
		!UNSUPPORTED_WALLET_IDS.has(connector.id) &&
		!UNSUPPORTED_WALLET_NAMES.has(connector.name)
	)
}
