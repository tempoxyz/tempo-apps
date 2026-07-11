# Tempo Apps

Tempo Apps is the monorepo for the applications and services that make up Tempo's developer-facing infrastructure, including block exploration, account tooling, documentation search, and network services. Developers working with Tempo can use these projects as reference implementations or hosted services for block exploration, fee sponsorship, token metadata, smart contract verification, and related workflows.

These apps are maintained by the Tempo team and complement the core [`tempo`](https://github.com/tempoxyz/tempo) node. See the [Tempo developer documentation](https://tempo.xyz/developers/docs) for integration guides and protocol documentation.

## Apps

| Category | Workspace | Description | URL |
| -------- | --------- | ----------- | --- |
| **Explorer** | [`apps/explorer`](apps/explorer) | Mainnet, testnet, and devnet explorer | [`explore.tempo.xyz`](<https://explore.tempo.xyz>) |
| **Wallet and account management** | [`apps/fee-payer`](apps/fee-payer) | Transaction fee sponsorship service | [`sponsor.testnet.tempo.xyz`](<https://sponsor.testnet.tempo.xyz>) |
| **Wallet and account management** | [`apps/key-manager`](apps/key-manager) | WebAuthn key management service | [`keys.tempo.xyz`](<https://keys.tempo.xyz>) |
| **Developer services** | [`apps/tokenlist`](apps/tokenlist) | Tokenlist registry and API | [`tokenlist.tempo.xyz`](<https://tokenlist.tempo.xyz/docs>) |
| **Developer services** | [`apps/contract-verification`](apps/contract-verification) | Smart contract verification service | [`contracts.tempo.xyz`](<https://contracts.tempo.xyz/docs>) |
| **Developer services** | [`apps/og`](apps/og) | Open Graph image generation worker | [`og.tempo.xyz`](<https://og.tempo.xyz>) |
| **Developer services** | [`apps/mcp-docs-indexer`](apps/mcp-docs-indexer) | MCP documentation indexer and search service | [`mcp.tempo.xyz`](<https://mcp.tempo.xyz>) |
| **Network infrastructure** | [`apps/reth-snapshots-viewer`](apps/reth-snapshots-viewer) | Reth snapshots viewer | [`snapshots.reth.rs`](<https://snapshots.reth.rs>) |
| **Network infrastructure** | [`apps/tempo-snapshots-viewer`](apps/tempo-snapshots-viewer) | Tempo snapshots viewer | [`snapshots.tempo.xyz`](<https://snapshots.tempo.xyz>) |

## Related projects

- [`tempoxyz/tempo`](https://github.com/tempoxyz/tempo): Core Tempo node and protocol implementation.
- [`tempoxyz/tidx`](https://github.com/tempoxyz/tidx): Chain indexer for querying Tempo blocks, transactions, and logs.
- [`tempoxyz/wallet-cli`](https://github.com/tempoxyz/wallet-cli): Command-line wallet and HTTP client for Tempo and MPP-enabled services.

## Contributing

Our contributor guidelines can be found in [`CONTRIBUTING.md`](https://github.com/tempoxyz/tempo-apps?tab=contributing-ov-file).

## Security

See [`SECURITY.md`](https://github.com/tempoxyz/tempo-apps?tab=security-ov-file).

## License

Licensed under either of [Apache License](./LICENSE-APACHE), Version
2.0 or [MIT License](./LICENSE-MIT) at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in these packages by you, as defined in the Apache-2.0 license,
shall be dual licensed as above, without any additional terms or conditions.
