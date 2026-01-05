import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from 'react'
import { KeyManager, webAuthn } from 'tempo.ts/wagmi'
import type { Chain } from 'viem'
import { tempoTestnet } from 'viem/chains'
import { withFeePayer } from 'viem/tempo'
import type { Config } from 'wagmi'
import {
	createConfig,
	http,
	useAccount,
	useConnect,
	useDisconnect,
	WagmiProvider,
} from 'wagmi'

export interface TempoWalletConfig {
	rpcUrl: string
	feePayerUrl?: string
	keyManagerUrl?: string
	feeToken?: string
}

export interface TempoWalletProviderProps {
	config: TempoWalletConfig
	children: React.ReactNode
	queryClient?: QueryClient
}

const TempoWalletContext = createContext<{
	address?: `0x${string}`
	isConnected: boolean
	isConnecting: boolean
	error: Error | null
	connect: (args?: { signUp?: boolean }) => Promise<void>
	disconnect: () => void
} | null>(null)

// Default internal query client if none provided
const defaultQueryClient = new QueryClient()

let globalWagmiConfig: Config | null = null

const TempoWalletInner: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const { address, isConnected, isConnecting } = useAccount()
	const { connectAsync, connectors } = useConnect()
	const { disconnect } = useDisconnect()
	const [error, setError] = useState<Error | null>(null)

	const handleConnect = useCallback(
		async (args?: { signUp?: boolean }) => {
			setError(null)
			const connector = connectors.find((c) => c.id === 'webAuthn')
			if (!connector) {
				setError(new Error('Passkey connector not found'))
				return
			}

			const capabilities = {
				type: args?.signUp ? 'sign-up' : 'sign-in',
				...(args?.signUp ? {} : { selectAccount: true }),
			}

			try {
				await connectAsync({
					connector,
					capabilities,
				} as unknown as Parameters<typeof connectAsync>[0])
			} catch (err: unknown) {
				console.error('Passkey connection failed:', err)
				setError(err instanceof Error ? err : new Error('Unknown error'))
				// Re-throw so the UI can also catch it if they await this function
				throw err
			}
		},
		[connectAsync, connectors],
	)

	const value = useMemo(
		() => ({
			address,
			isConnected,
			isConnecting,
			error,
			connect: handleConnect,
			disconnect: () => disconnect(),
		}),
		[address, isConnected, isConnecting, error, handleConnect, disconnect],
	)

	return (
		<TempoWalletContext.Provider value={value}>
			{children}
		</TempoWalletContext.Provider>
	)
}

export const TempoWalletProvider: React.FC<TempoWalletProviderProps> = ({
	config,
	children,
	queryClient,
}) => {
	const chain = useMemo(
		() =>
			tempoTestnet.extend({
				feeToken: (config.feeToken ||
					'0x20c0000000000000000000000000000000000001') as `0x${string}`,
			}) as unknown as Chain,
		[config.feeToken],
	)

	const keyManager = useMemo(() => {
		if (config.keyManagerUrl) {
			return KeyManager.http(config.keyManagerUrl)
		}
		return KeyManager.localStorage()
	}, [config.keyManagerUrl])

	const wagmiConfig = useMemo(() => {
		if (globalWagmiConfig) return globalWagmiConfig

		const transport = config.feePayerUrl
			? withFeePayer(http(config.rpcUrl), http(config.feePayerUrl))
			: http(config.rpcUrl)

		globalWagmiConfig = createConfig({
			chains: [chain],
			connectors: [
				webAuthn({
					keyManager,
				}),
			],
			transports: {
				[chain.id]: transport,
			},
		})
		return globalWagmiConfig
	}, [chain, keyManager, config.rpcUrl, config.feePayerUrl])

	return (
		<WagmiProvider config={wagmiConfig}>
			<QueryClientProvider client={queryClient || defaultQueryClient}>
				<TempoWalletInner>{children}</TempoWalletInner>
			</QueryClientProvider>
		</WagmiProvider>
	)
}

export const useTempoWallet = () => {
	const context = useContext(TempoWalletContext)
	if (!context) {
		throw new Error('useTempoWallet must be used within a TempoWalletProvider')
	}
	return context
}
