# Tempo Tokenlist Registry & API

API for serving token lists and icons for Tempo networks.

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
     "logoURI": "https://esm.sh/gh/tempoxyz/tokenlist/data/42429/icons/<address>.svg",
     "extensions": {
       "chain": "tempo"
     }
   }
   ```

2. Add an SVG icon to [`data/<chain_id>/icons/<address>.svg`](./data/42429/icons/0x20c0000000000000000000000000000000000000.svg)

   - Use lowercase address for the filename
   - SVG format only

3. Process icons (optional)

   ```sh
   pnpm process-icons
   ```
