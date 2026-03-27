# Tempo Tokenlist Registry & API

[Uniswap Token Lists](https://tokenlists.org)-compatible API for serving token lists and icons for Tempo chains (testnet, mainnet).

## Adding a New Token

1. Update [`data/<chain_id>/tokenlist.json`](./data/42429/tokenlist.json)

   Edit `data/<chain_id>/tokenlist.json` and add your token:

   ```json
   {
     "name": "MyToken",
     "symbol": "MTK",
     "decimals": 18,
     "chainId": 42429,
     "address": "0x...",
     "logoURI": "https://esm.sh/gh/tempoxyz/tempo-apps/apps/tokenlist/data/42429/icons/<address>.svg",
     "extensions": {
       "chain": "tempo"
     }
   }
   ```

2. Add an SVG icon to [`apps/tokenlist/data/<chain_id>/icons/<address>.svg`](./data/42429/icons/0x20c0000000000000000000000000000000000000.svg)

   - Use lowercase address for the filename
   - SVG format only

3. Process icons (optional)

   ```sh
   pnpm process-icons
   ```

## Token Extensions

Tokens may include additional metadata in the `extensions` field:

### `coingeckoId`

The CoinGecko API identifier for the token, used by aggregators (e.g., DeFi Llama) for automatic price mapping.

```json
"extensions": {
  "coingeckoId": "usd-coin"
}
```

### `bridgeInfo`

For bridged tokens, identifies the origin chain and source contract address. This enables aggregators to automatically map bridged assets to their canonical counterparts.

- `sourceChainId`: Standard chain ID of the origin chain (e.g., `1` for Ethereum)
- `sourceAddress`: Contract address on the origin chain

```json
"extensions": {
  "coingeckoId": "usd-coin",
  "bridgeInfo": {
    "sourceChainId": 1,
    "sourceAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  }
}
```

Native tokens (e.g., PathUSD) include `coingeckoId` but omit `bridgeInfo`.
