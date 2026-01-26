# Tempo Moderato Testnet: Fund + TIP-20 Token Transfer Demo

This is a self-contained demo for the Tempo Moderato Testnet.

It demonstrates how to:
1) Fund an address using the Tempo faucet JSON-RPC method (tempo_fundAddress)
2) Transfer a TIP-20 faucet token (pathUSD / AlphaUSD / BetaUSD / ThetaUSD)
3) Print the transaction explorer link and before/after balances

## Requirements
- Node.js >= 18

## How to run this demo

All commands below must be executed from this directory:

scripts/tempo-testnet-token-transfer

## Setup
cd scripts/tempo-testnet-token-transfer
cp .env.example .env
# edit .env and set PRIVATE_KEY (optionally TO_ADDRESS)
npm install

## Run
node fund.mjs
node transfer.mjs

