/**
 * Tempo Sub-Second Streaming Payment Engine
 */

import crypto from 'crypto';
import { TEMPO_CONFIG } from '../config.js';

export class StreamPaymentEngine {
  constructor() {
    this.activeChannels = new Map();
    this.settlementLogs = [];
  }

  createChannel(payerAddress = null) {
    const channelId = `chn_${crypto.randomBytes(12).toString('hex')}`;
    const payer = payerAddress || '0x' + crypto.randomBytes(20).toString('hex');
    const channel = {
      channelId,
      payer,
      totalPaid: '0.0000',
      chunksSettled: 0,
      createdAt: new Date().toISOString(),
      status: 'active',
    };

    this.activeChannels.set(channelId, channel);
    return channel;
  }

  /**
   * Process a sub-second streaming payment tick (0.0001 TUSD)
   */
  processStreamTick(channelId, chunkText) {
    const channel = this.activeChannels.get(channelId);
    if (!channel) throw new Error('Streaming channel not found');

    const price = parseFloat(TEMPO_CONFIG.streaming.pricePerChunk);
    const updatedTotal = (parseFloat(channel.totalPaid) + price).toFixed(4);

    channel.totalPaid = updatedTotal;
    channel.chunksSettled += 1;

    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const log = {
      id: `tick_${Date.now()}_${channel.chunksSettled}`,
      channelId,
      payer: channel.payer,
      amountPaid: `${TEMPO_CONFIG.streaming.pricePerChunk} ${TEMPO_CONFIG.streaming.currency}`,
      totalChannelPaid: `${updatedTotal} ${TEMPO_CONFIG.streaming.currency}`,
      chunkText,
      txHash,
      latencyMs: Math.floor(Math.random() * 15) + 20, // 20-35ms
      timestamp: new Date().toISOString(),
      network: TEMPO_CONFIG.network.name,
    };

    this.settlementLogs.unshift(log);
    this.activeChannels.set(channelId, channel);

    return { channel, log };
  }

  getLogs(channelId = null) {
    if (!channelId) return this.settlementLogs;
    return this.settlementLogs.filter(l => l.channelId === channelId);
  }
}

export const defaultStreamEngine = new StreamPaymentEngine();
