# Wallet Example App

This is a demonstration application for the `@tempo/passkey-sdk`. It showcases how to integrate Passkey-based wallets into a React application with zero friction.

## Getting Started

### 1. Install Dependencies

Run from the monorepo root:

```bash
pnpm install
```

### 2. Run in Development Mode

```bash
pnpm --filter wallet-example dev
```

The app will be available at `http://localhost:5173`.

## Mobile Testing (FaceID / TouchID)

Passkeys require a secure context (HTTPS) and hardware biometric sensors. To test on a real phone:

1. Start the dev server.
2. Use **ngrok** to create an HTTPS tunnel:
   ```bash
   ngrok http 5173
   ```
3. Open the `ngrok` URL on your iPhone or Android device.
4. Tap **"Create New Wallet"** to trigger FaceID/Biometrics.

## Configuration

The app is configured in `src/main.tsx`. You can adjust the RPC and Fee Payer URLs to match your local or testnet environment.

```tsx
const config = {
  rpcUrl: 'https://rpc.testnet.tempo.xyz',
  feePayerUrl: 'https://sponsor.testnet.tempo.xyz',
};
```

## Features Demonstrated

- **Passkey Sign-up/Sign-in**: Handled by `@tempo/passkey-sdk`.
- **Automatic Multi-account Support**: Uses `selectAccount: true` by default.
- **Sponsor Gas integration**: Configured via the `feePayerUrl`.
