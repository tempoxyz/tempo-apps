/**
 * Tempo Stream Paywall Client Logic (Server-Sent Events)
 */

let selectedArticle = null;
let activeChannel = null;
let eventSource = null;

document.addEventListener('DOMContentLoaded', () => {
  loadConfigAndArticles();
  initActionListeners();
});

async function loadConfigAndArticles() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    const container = document.getElementById('articles-container');

    container.innerHTML = '';
    data.articles.forEach((art, idx) => {
      const card = document.createElement('div');
      card.className = `article-card ${idx === 0 ? 'active' : ''}`;
      card.innerHTML = `
        <div class="art-title">${art.title}</div>
        <div class="art-summary">${art.summary}</div>
      `;
      card.addEventListener('click', () => {
        document.querySelectorAll('.article-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectArticle(art);
      });
      container.appendChild(card);
    });

    if (data.articles.length > 0) {
      selectArticle(data.articles[0]);
    }
  } catch (e) {
    console.error('Config fetch error:', e);
  }
}

function selectArticle(art) {
  selectedArticle = art;
  document.getElementById('reader-title').textContent = art.title;
  document.getElementById('reader-author').textContent = `Author: ${art.author}`;
  document.getElementById('reader-category').textContent = art.category;
  document.getElementById('reader-content-box').innerHTML = `
    <div class="empty-state">
      🔒 Click "Open Channel & Stream Read" to begin sub-second blockchain settlement and read in real-time.
    </div>
  `;
}

function initActionListeners() {
  document.getElementById('btn-stream-read').addEventListener('click', async () => {
    if (!selectedArticle) return;
    const btn = document.getElementById('btn-stream-read');
    const contentBox = document.getElementById('reader-content-box');

    btn.disabled = true;
    btn.textContent = '⏳ Opening Channel on Tempo...';

    if (eventSource) {
      eventSource.close();
    }

    try {
      // 1. Open Payment Channel
      const chRes = await fetch('/api/stream/open-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payer: '0xWebReaderUser' }),
      });
      const chData = await chRes.json();
      activeChannel = chData.channel;

      document.getElementById('track-channel-id').textContent = activeChannel.channelId;
      document.getElementById('header-stream-status').textContent = 'Streaming Active';

      contentBox.innerHTML = ''; // Clear for stream
      btn.textContent = '⚡ Streaming Live from Tempo...';

      // 2. Connect to Server-Sent Events stream
      eventSource = new EventSource(`/api/stream/read/${selectedArticle.id}?channelId=${activeChannel.channelId}`);

      eventSource.addEventListener('tick', (e) => {
        const data = JSON.parse(e.data);
        contentBox.innerHTML += data.chunk;
        contentBox.scrollTop = contentBox.scrollHeight;

        document.getElementById('header-total-paid').textContent = data.totalChannelPaid;
        document.getElementById('track-latest-tx').textContent = `${data.txHash.slice(0, 10)}...`;
        document.getElementById('track-latency').textContent = `${data.latencyMs} ms`;
      });

      eventSource.addEventListener('complete', () => {
        eventSource.close();
        btn.disabled = false;
        btn.textContent = '✅ Finished Reading (Fully Settled)';
        document.getElementById('header-stream-status').textContent = 'Stream Completed';
      });

      eventSource.onerror = () => {
        eventSource.close();
        btn.disabled = false;
        btn.textContent = '⚡ Stream Read ($0.0001/tick)';
      };

    } catch (err) {
      alert(`Stream Error: ${err.message}`);
      btn.disabled = false;
      btn.textContent = '⚡ Open Channel & Stream Read';
    }
  });
}
