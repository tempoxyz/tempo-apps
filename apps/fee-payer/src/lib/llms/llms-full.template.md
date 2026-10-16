# Tempo Fee Payer — Full LLM Reference

> Comprehensive reference for agents and AI systems using the Tempo Fee Payer.

The Tempo Fee Payer is a JSON-RPC relay that sponsors transaction fees on Tempo. A client signs a Tempo transaction that leaves the fee payer signature empty and sends it here. The sponsor adds its fee payer signature and pays the fees in PathUSD. Other JSON-RPC methods are forwarded to the network's node.

For a shorter overview, see [`/llms.txt`](/llms.txt).

## Networks

| Network | URL | Chain ID |
| --- | --- | --- |
| mainnet | https://sponsor.tempo.xyz | 4217 |
| moderato | https://sponsor.testnet.tempo.xyz, https://sponsor.moderato.tempo.xyz | 42431 |
| devnet | https://sponsor.devnet.tempo.xyz | 31318 |

## API Keys

API keys are issued for mainnet, which rejects requests to `/` without one. Send the key as the path, for example `https://sponsor.tempo.xyz/tp_...`. A key can cap its daily spend and restrict which addresses its sponsored transactions call.

## API Routes

Routes return JSON. The sponsor routes accept one JSON-RPC request per HTTP request; batches are rejected, and `id` must be a number.

{{api}}

## JSON-RPC Methods

- `eth_fillTransaction`: fills gas, nonce, and fees with the sponsor as fee payer, unless the request sets `feePayer: false`.
- `eth_signRawTransaction`: returns the transaction with the sponsor's fee payer signature, for the client to broadcast.
- `eth_sendRawTransaction` and `eth_sendRawTransactionSync`: add the fee payer signature and broadcast. The sync method waits for the receipt.
- Any other method is forwarded to the node.

## Common Tasks

### Sponsor transactions with viem

Wrap the network transport with `withRelay`, then send transactions with `feePayer: true`:

```ts
import { createClient, http } from 'viem'
import { tempo } from 'viem/chains'
import { withRelay } from 'viem/tempo'

const client = createClient({
  chain: tempo,
  transport: withRelay(http(), http('https://sponsor.tempo.xyz/tp_...'), {
    policy: 'sign-and-broadcast',
  }),
})
```

With `policy: 'sign-only'`, the client broadcasts the signed transaction itself.

### Check how much the sponsor has paid

```txt
/usage?blockTimestampFrom={number}&blockTimestampTo={number}
```

## Errors

- `400`: malformed JSON-RPC request or transaction.
- `401`: missing, invalid, or revoked API key.
- `403`: the API key does not allow the transaction's destination.
- `429`: rate limit, or the API key's daily spend limit, exceeded.
