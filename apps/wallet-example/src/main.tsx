import React from 'react';
import ReactDOM from 'react-dom/client';
import { TempoWalletProvider } from '@tempo/passkey-sdk';
import App from './App';

const config = {
    // Tempo Testnet Standard RPC
    rpcUrl: 'https://rpc.testnet.tempo.xyz',
    // Standard Fee Payer (adjust if you have a local for the PR demo)
    feePayerUrl: 'https://sponsor.testnet.tempo.xyz',
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <TempoWalletProvider config={config}>
            <App />
        </TempoWalletProvider>
    </React.StrictMode>,
);
