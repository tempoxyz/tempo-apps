/**
 * Tempo Agent Paywall & Live Content Streamer Web Server
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEMPO_CONFIG } from '../config.js';
import { defaultStreamEngine } from '../core/stream-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.join(__dirname, '../../web');

const app = express();
const PORT = process.env.PORT || 3409;

app.use(cors());
app.use(express.json());
app.use(express.static(WEB_ROOT));

// 1. Get Config & Articles
app.get('/api/config', (req, res) => {
  res.json({
    network: TEMPO_CONFIG.network,
    streaming: TEMPO_CONFIG.streaming,
    articles: TEMPO_CONFIG.premiumContent.map(a => ({
      id: a.id,
      title: a.title,
      author: a.author,
      category: a.category,
      summary: a.summary,
    })),
  });
});

// 2. Open Stream Payment Channel
app.post('/api/stream/open-channel', (req, res) => {
  const { payer } = req.body;
  const channel = defaultStreamEngine.createChannel(payer);
  res.json({ success: true, channel });
});

// 3. SSE Live Content Stream with Sub-Second Micro-Settlement
app.get('/api/stream/read/:articleId', (req, res) => {
  const { articleId } = req.params;
  const channelId = req.query.channelId;

  const article = TEMPO_CONFIG.premiumContent.find(a => a.id === articleId);
  if (!article) {
    return res.status(404).json({ error: 'Article not found' });
  }
  if (!channelId) {
    return res.status(402).json({ error: 'Payment Required: Missing channelId parameter' });
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const words = article.fullText.split(' ');
  let wordIndex = 0;
  const chunkSize = 4; // 4 words per tick

  const interval = setInterval(() => {
    if (wordIndex >= words.length) {
      res.write(`event: complete\ndata: ${JSON.stringify({ message: 'Stream finished' })}\n\n`);
      clearInterval(interval);
      res.end();
      return;
    }

    const chunk = words.slice(wordIndex, wordIndex + chunkSize).join(' ') + ' ';
    wordIndex += chunkSize;

    const { channel, log } = defaultStreamEngine.processStreamTick(channelId, chunk);

    res.write(`event: tick\ndata: ${JSON.stringify({
      chunk,
      amountPaid: log.amountPaid,
      totalChannelPaid: log.totalChannelPaid,
      txHash: log.txHash,
      latencyMs: log.latencyMs,
    })}\n\n`);
  }, 120);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// 4. Stream Logs
app.get('/api/stream/logs', (req, res) => {
  const { channelId } = req.query;
  res.json(defaultStreamEngine.getLogs(channelId));
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`⚡ Tempo Sub-Second Agent Paywall & Streamer Running!`);
    console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
    console.log(`⛓️  Connected to: Tempo Moderato Testnet (Chain ID 424242)`);
    console.log(`======================================================\n`);
  });
}

export default app;
