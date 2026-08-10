/**
 * Tempo Moderato & Stream Paywall Configuration
 */

export const TEMPO_CONFIG = {
  network: {
    name: 'Tempo Moderato Testnet',
    chainId: 424242,
    currency: { name: 'Tempo USD', symbol: 'TUSD', decimals: 6 },
    rpcUrl: process.env.TEMPO_RPC_URL || 'https://moderato.tempo.xyz',
    explorerUrl: 'https://explore.tempo.xyz',
  },
  streaming: {
    pricePerChunk: '0.0001', // TUSD per streaming chunk
    currency: 'TUSD',
    settlementIntervalMs: 40, // Sub-50ms streaming tick
  },
  premiumContent: [
    {
      id: 'article_ai_macro',
      title: 'Autonomous AI Agents & Sub-Second Financial Settlement',
      author: 'Tempo & Stripe Research',
      category: 'Protocol Engineering',
      summary: 'An architectural deep dive into sub-cent streaming payment channels for autonomous LLM swarms.',
      fullText: 'Autonomous artificial intelligence agents represent the fastest-growing consumers of computational APIs worldwide. Traditional card settlement networks incur flat base fees (e.g. $0.30 + 2.9%), making per-token and per-inference micro-transactions economically unviable. The Tempo blockchain, engineered on the high-performance Reth execution client with sub-second finality, completely reimagines internet commerce. By implementing the Machine Payments Protocol (MPP), AI models can open peer-to-peer streaming payment channels directly over standard HTTP 402 headers, streaming 0.0001 TUSD per generated paragraph with cryptographic zero-latency settlement.',
    },
    {
      id: 'article_defi_arbitrage',
      title: 'High-Frequency Cross-DEX Arbitrage on Tempo L1',
      author: 'Quantitative Systems Lab',
      category: 'Quantitative Finance',
      summary: 'Strategies for leveraging sub-second finality and native stablecoin gas fees for MEV protection.',
      fullText: 'On traditional EVM chains, MEV bots and priority gas auctions create significant transaction reordering risks and high volatility in execution costs. Tempo eliminates base currency volatility by standardizing transaction gas payments in native stablecoins (TUSD). Sub-second block times and deterministic state transitions allow arbitrage algorithms to settle multi-hop liquidity swaps with near-instant cryptographic certainty, eliminating slippage and safeguarding user liquidity pools across decentralized exchanges.',
    },
  ],
};
