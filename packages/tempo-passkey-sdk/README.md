# @tempo/passkey-sdk

The official Passkey (WebAuthn) SDK for the Tempo Ecosystem.  
Build secure, non-custodial, and "seedless" Smart Account wallets with just a few lines of code.

## Features

- **Biometric Security**: FaceID, TouchID, and Windows Hello support out-of-the-box.
- **Zero-Friction Onboarding**: Create wallets in seconds without seed phrases.
- **Gas Sponsorship Ready**: Built-in support for Tempo Paymaster.
- **Usernameless Login**: Supports Discoverable Credentials (Resident Keys) for one-tap sign-in.
- **Mobile Optimized**: Works seamlessly on iOS and Android via Safari/Chrome.

## Installation

```bash
pnpm add @tempo/passkey-sdk viem wagmi @tanstack/react-query
```

## Quick Start (Integration Template)

Here is a complete, copy-paste ready example to integrate the wallet into your React app.

```tsx
import React from 'react';
import { TempoWalletProvider, useTempoWallet } from '@tempo/passkey-sdk';

// 1. Configuration
const config = {
  rpcUrl: 'https://rpc.testnet.tempo.xyz',
  feePayerUrl: 'https://sponsor.testnet.tempo.xyz', // Optional: For gas sponsorship
};

// 2. Wallet Component
const WalletUI = () => {
  const { address, isConnected, isConnecting, error, connect, disconnect } = useTempoWallet();

  if (isConnected) {
    return (
      <div>
        <h3>Wallet Connected</h3>
        <p>Address: <code style={{ color: 'blue' }}>{address}</code></p>
        <button onClick={() => disconnect()}>Logout</button>
      </div>
    );
  }

  return (
    <div>
      <h3>Not Connected</h3>
      
      {/* Error Handling */}
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        {/* Login with existing Passkey (Resident Key) */}
        <button disabled={isConnecting} onClick={() => connect({ signUp: false })}>
          {isConnecting ? 'Verifying...' : 'Sign In'}
        </button>

        {/* Create new Passkey */}
        <button disabled={isConnecting} onClick={() => connect({ signUp: true })}>
          {isConnecting ? 'Creating...' : 'Create New Wallet'}
        </button>
      </div>
    </div>
  );
};

// 3. Root Provider Wrapper
export const App = () => {
  return (
    <TempoWalletProvider config={config}>
      <WalletUI />
    </TempoWalletProvider>
  );
};
```

## Configuration Types

```tsx
export interface TempoWalletConfig {
  rpcUrl: string;         // Tempo RPC Endpoint
  feePayerUrl?: string;   // Optional: URL for Gas Sponsorship
  keyManagerUrl?: string; // Optional: URL for shared Key Management across apps
  feeToken?: string;      // Optional: ERC20 address for gas (defaults to Tempo stablecoin)
}
```

## Secure Context Warning

Passkeys (WebAuthn) strictly require a **Secure Context**.
- **Local Dev**: Use `http://localhost` or `http://127.0.0.1`.
- **Remote Dev/Mobile**: You **MUST** use HTTPS (e.g., via `ngrok` or Vercel).
- **Production**: HTTPS is mandatory.

## Testing

The SDK includes unit tests and type checks:

```bash
cd packages/tempo-passkey-sdk
pnpm check:types
```

For a full demo app, check `apps/wallet-example` in the monorepo.
