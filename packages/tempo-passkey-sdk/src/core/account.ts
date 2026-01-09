import { createClient, http, type Chain, type Transport, type Account } from 'viem';
import { tempoTestnet } from 'viem/chains';
import { withFeePayer } from 'viem/tempo';

export interface TempoAccountConfig {
    rpcUrl: string;
    feePayerUrl?: string;
    chain?: Chain;
    feeToken?: `0x${string}`;
}

export const TEMPO_TESTNET_CONFIG: TempoAccountConfig = {
    rpcUrl: 'https://rpc.testnet.tempo.xyz',
    feePayerUrl: 'https://sponsor.testnet.tempo.xyz',
    chain: tempoTestnet.extend({
        feeToken: '0x20c0000000000000000000000000000000000001',
    } as any),
};

export function createTempoClient(config: TempoAccountConfig, account?: Account) {
    const chain = config.chain || TEMPO_TESTNET_CONFIG.chain;

    let transport: Transport;
    if (config.feePayerUrl) {
        transport = withFeePayer(
            http(config.rpcUrl),
            http(config.feePayerUrl)
        );
    } else {
        transport = http(config.rpcUrl);
    }

    return createClient({
        account,
        chain,
        transport,
    });
}
