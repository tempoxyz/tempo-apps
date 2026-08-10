#!/usr/bin/env node

/**
 * Tempo Stream Paywall CLI
 */

import { TEMPO_CONFIG } from '../src/config.js';
import { defaultStreamEngine } from '../src/core/stream-engine.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  switch (command.toLowerCase()) {
    case 'articles': {
      console.log('\n📰 Available Premium Paywalled Content on Tempo:');
      TEMPO_CONFIG.premiumContent.forEach(a => {
        console.log(`  • [${a.id}] ${a.title}`);
        console.log(`    Author:   ${a.author} (${a.category})`);
        console.log(`    Summary:  ${a.summary}\n`);
      });
      break;
    }

    case 'channel': {
      const payer = args[1] || '0xDemoAgentWallet111111111111111111111111';
      console.log(`\n⚡ Opening Streaming Payment Channel for ${payer}...`);
      const ch = defaultStreamEngine.createChannel(payer);
      console.log(`  Channel ID:  ${ch.channelId}`);
      console.log(`  Status:      ${ch.status}`);
      console.log(`  Price/Chunk: ${TEMPO_CONFIG.streaming.pricePerChunk} ${TEMPO_CONFIG.streaming.currency}\n`);
      break;
    }

    case 'read': {
      const articleId = args[1] || 'article_ai_macro';
      const article = TEMPO_CONFIG.premiumContent.find(a => a.id === articleId) || TEMPO_CONFIG.premiumContent[0];
      const ch = defaultStreamEngine.createChannel('0xCliReaderWallet');

      console.log(`\n📖 Streaming '${article.title}' via Channel ${ch.channelId}...\n`);
      const words = article.fullText.split(' ');
      let index = 0;

      while (index < words.length) {
        const chunk = words.slice(index, index + 4).join(' ') + ' ';
        index += 4;
        const { log } = defaultStreamEngine.processStreamTick(ch.channelId, chunk);
        process.stdout.write(chunk);
        await new Promise(r => setTimeout(r, 60));
      }

      console.log(`\n\n✅ Stream Finished! Settled ${ch.totalPaid} ${TEMPO_CONFIG.streaming.currency} over ${ch.chunksSettled} sub-second blockchain ticks.\n`);
      break;
    }

    case 'studio': {
      console.log('\n🌐 Launching Tempo Stream Paywall Web Studio on :3409...');
      await import('../src/server/app.js');
      break;
    }

    default: {
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║        ⚡ TEMPO SUB-SECOND AGENT PAYWALL & STREAMER CLI          ║
║      Real-time Micro-Settlements & Live Content Streaming        ║
╚══════════════════════════════════════════════════════════════════╝

Commands:
  tempo-stream articles                List available premium articles
  tempo-stream channel [payer]         Open a sub-second streaming channel
  tempo-stream read [articleId]        Stream article with live micro-settlement
  tempo-stream studio                  Launch Interactive Web Studio on :3409
      `);
      break;
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
