# @tempo/passkey-sdk

The official Passkey Wallet SDK for the Tempo Ecosystem. Build non-custodial wallets with zero friction using WebAuthn (FaceID/TouchID) and Account Abstraction.

## Features

- **Zero Friction**: Social login experience with the security of a hardware wallet.
- **Sponsor Gas Ready**: Built-in support for Tempo's Paymaster (sponsored transactions).
- **Viem/Wagmi Compatible**: Seamless integration with the most popular Ethereum libraries.
- **React Hooks**: Simple `useTempoWallet` hook for rapid development.
- **Cross-App Identification**: Support for shared Key Managers (e.g., across-pay).

## Installation

```bash
pnpm add @tempo/passkey-sdk
```

## Quick Start (React)

### 1. Setup the Provider

Wrap your application with `TempoWalletProvider`. It handles Wagmi, TanStack Query, and the Key Manager automatically.

```tsx
import { TempoWalletProvider } from '@tempo/passkey-sdk';

const config = {
  rpcUrl: 'https://rpc.testnet.tempo.xyz',
  feePayerUrl: 'https://sponsor.testnet.tempo.xyz', // Your Paymaster URL
  keyManagerUrl: 'https://keys.tempo.xyz',        // Optional: Shared Key Manager
};

function Root() {
  return (
    <TempoWalletProvider config={config}>
      <App />
    </TempoWalletProvider>
  );
}
```

### 2. Connect the Wallet

```tsx
import { useTempoWallet } from '@tempo/passkey-sdk';

function App() {
  const { address, isConnected, isConnecting, connect, disconnect } = useTempoWallet();

  if (isConnected) {
    return (
      <div>
        <p>Wallet: {address}</p>
        <button onClick={disconnect}>Logout</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => connect({ signUp: false })}>Sign In</button>
      <button onClick={() => connect({ signUp: true })}>Create New Wallet</button>
    </div>
  );
}
```

## API

### `useTempoWallet()`

Returns:
- `address`: The Smart Account address (0x...).
- `isConnected`: Boolean state.
- `isConnecting`: Boolean state for loading UI.
- `connect(options)`: Function to trigger WebAuthn.
  - `options.signUp`: `true` to create a new Passkey, `false` to sign in with existing.
- `disconnect()`: Clears the session.

## Testing

The SDK includes unit tests for utility functions:

```bash
cd packages/tempo-passkey-sdk
pnpm test
```
