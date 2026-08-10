/**
 * Tempo Stream Engine Tests
 */

import { defaultStreamEngine } from '../src/core/stream-engine.js';

async function runStreamTests() {
  console.log('Testing Tempo Sub-Second Streaming Engine...');

  const ch = defaultStreamEngine.createChannel('0xAlicePayerAddress');
  if (!ch.channelId.startsWith('chn_') || ch.totalPaid !== '0.0000') {
    throw new Error('Channel creation failed');
  }

  const { channel, log } = defaultStreamEngine.processStreamTick(ch.channelId, 'Hello world stream chunk');
  if (channel.chunksSettled !== 1 || channel.totalPaid !== '0.0001') {
    throw new Error('Stream tick settlement calculation failed');
  }

  if (!log.txHash || log.latencyMs <= 0) {
    throw new Error('Settlement log missing txHash or latency');
  }

  console.log(`✅ Sub-Second Streaming Tick Settled: ${log.amountPaid} in ${log.latencyMs}ms on Tempo!`);
}

runStreamTests().catch(e => {
  console.error('❌ Stream Test Failed:', e);
  process.exit(1);
});
