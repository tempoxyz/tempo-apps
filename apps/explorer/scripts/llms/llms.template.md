# Tempo Explorer

> The official block explorer for the Tempo blockchain. View blocks, transactions, receipts, addresses, contracts, tokens, TIP-403 policies, Fee AMM pools, and network activity.

For a full reference, see [`/llms-full.txt`](/llms-full.txt).

## What You Can Do

- Search by address, transaction hash, block number, or token.
- Inspect transaction receipts, events, balance changes, calls, traces, and raw transaction data.
- Export receipts as JSON, plain text, or PDF.
- Browse recent blocks and inspect a block's transactions.
- Inspect addresses, balances, transaction history, contracts, and token activity.
- View TIP-20 token metadata, transfers, and holders.
- View TIP-403 policy types, administrators, members, composed policies, and policy events.
- Read verified contracts and interact with contract functions when an ABI is available.
- Simulate calls and batches against the chain.
- Browse Fee AMM pools, reserves, liquidity, and routes.
- Export address transactions and balances as CSV.

## Networks

{{networks}}

## Pages

{{pages}}

## Example Queries

| User question | Explorer URL |
| --- | --- |
| Show address `0xabc...` | `/address/0xabc...` |
| Show this transaction hash | `/tx/{hash}` |
| Show the receipt | `/receipt/{hash}` |
| Get the receipt as JSON | `/receipt/{hash}.json` |
| Show block 12345 | `/block/12345` |
| Show latest blocks | `/blocks` |
| Show all tokens | `/tokens` |
| Show Fee AMM pools | `/fee-amm` |
| Show token holders | `/address/{tokenAddress}?tab=holders` |
| Read a contract | `/address/{contractAddress}?tab=contract` |
| Interact with a contract | `/address/{contractAddress}?tab=interact` |
| Simulate a call | `/simulate?from={address}&to={address}&data={calldata}` |

## Public APIs

{{api}}
