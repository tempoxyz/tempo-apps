import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { tempoTestnet } from 'viem/chains';
import { createConfig, http, WagmiProvider, useAccount, useConnect, useDisconnect } from 'wagmi';
import { webAuthn, KeyManager } from 'tempo.ts/wagmi';
import { withFeePayer } from 'viem/tempo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export interface TempoWalletConfig {
    rpcUrl: string;
    feePayerUrl?: string;
    keyManagerUrl?: string;
    feeToken?: string;
}

export interface TempoWalletProviderProps {
    config: TempoWalletConfig;
    children: React.ReactNode;
    queryClient?: QueryClient;
}

const TempoWalletContext = createContext<any>(null);

// Default internal query client if none provided
const defaultQueryClient = new QueryClient();

let globalWagmiConfig: any = null;

const TempoWalletInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { address, isConnected, isConnecting } = useAccount();
    const { connectAsync, connectors } = useConnect();
    const { disconnect } = useDisconnect();

    const handleConnect = useCallback(async (args?: { signUp?: boolean }) => {
        const connector = connectors.find((c) => c.id === 'webAuthn');
        if (!connector) return;

        const capabilities = {
            type: args?.signUp ? 'sign-up' : 'sign-in',
            ...(args?.signUp ? {} : { selectAccount: true }),
        };

        try {
            await connectAsync({
                connector,
                capabilities,
            } as any);
        } catch (error) {
            // error handling should be done by the consumer
        }
    }, [connectAsync, connectors]);

    const value = useMemo(() => ({
        address,
        isConnected,
        isConnecting,
        connect: handleConnect,
        disconnect: () => disconnect(),
    }), [address, isConnected, isConnecting, handleConnect, disconnect]);

    return (
        <TempoWalletContext.Provider value={value}>
            {children}
        </TempoWalletContext.Provider>
    );
};

export const TempoWalletProvider: React.FC<TempoWalletProviderProps> = ({ config, children, queryClient }) => {
    const chain = useMemo(() => tempoTestnet.extend({
        feeToken: config.feeToken || '0x20c0000000000000000000000000000000000001',
    } as any), [config.feeToken]);

    const keyManager = useMemo(() => {
        if (config.keyManagerUrl) {
            return KeyManager.http(config.keyManagerUrl);
        }
        return KeyManager.localStorage();
    }, [config.keyManagerUrl]);

    const wagmiConfig = useMemo(() => {
        if (globalWagmiConfig) return globalWagmiConfig;

        const transport = config.feePayerUrl
            ? withFeePayer(http(config.rpcUrl), http(config.feePayerUrl))
            : http(config.rpcUrl);

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
        });
        return globalWagmiConfig;
    }, [chain, keyManager, config.rpcUrl, config.feePayerUrl]);

    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient || defaultQueryClient}>
                <TempoWalletInner>
                    {children}
                </TempoWalletInner>
            </QueryClientProvider>
        </WagmiProvider>
    );
};

export const useTempoWallet = () => {
    const context = useContext(TempoWalletContext);
    if (!context) {
        throw new Error('useTempoWallet must be used within a TempoWalletProvider');
    }
    return context;
};
