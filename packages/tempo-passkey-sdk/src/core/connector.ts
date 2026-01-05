import { createConnector } from 'wagmi';
import { webAuthn, KeyManager } from 'tempo.ts/wagmi';

/**
 * TempoPasskeyConnector
 * A high-level Wagmi connector that simplifies Passkey (WebAuthn) 
 * and Account Abstraction (AA) integration on Tempo.
 */
export function tempoPasskeyConnector(options: {
    keyManager?: any; // Allow custom key manager
}) {
    // 1. Setup default KeyManager (localStorage) if not provided
    const keyManager = options.keyManager || KeyManager.localStorage();

    // 2. Return a factory function that Wagmi expects
    return createConnector((config) => ({
        ...webAuthn({
            keyManager,
            rpName: 'Tempo Wallet',
        })(config),

        id: 'tempo-passkey',
        name: 'Tempo Passkey',
        type: 'passkey',
    }));
}
