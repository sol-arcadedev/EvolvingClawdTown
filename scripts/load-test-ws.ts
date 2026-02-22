/**
 * WebSocket Load Test for Claude Town
 *
 * Simulates N concurrent WebSocket clients connecting to the server,
 * receiving snapshots, and listening for updates.
 *
 * Usage: npx tsx scripts/load-test-ws.ts [url] [clients] [duration_seconds]
 * Example: npx tsx scripts/load-test-ws.ts ws://localhost:3001/ws 1000 60
 */

import WebSocket from 'ws';

const WS_URL = process.argv[2] || 'ws://localhost:3001/ws';
const NUM_CLIENTS = parseInt(process.argv[3] || '1000');
const DURATION_S = parseInt(process.argv[4] || '60');

interface Stats {
  connected: number;
  failed: number;
  disconnected: number;
  messagesReceived: number;
  snapshotsReceived: number;
  connectTimes: number[];
}

const stats: Stats = {
  connected: 0,
  failed: 0,
  disconnected: 0,
  messagesReceived: 0,
  snapshotsReceived: 0,
  connectTimes: [],
};

const clients: WebSocket[] = [];

function connectClient(index: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const ws = new WebSocket(WS_URL);

    const timeout = setTimeout(() => {
      ws.close();
      stats.failed++;
      resolve();
    }, 10000);

    ws.on('open', () => {
      clearTimeout(timeout);
      stats.connected++;
      stats.connectTimes.push(Date.now() - start);
      clients.push(ws);
      resolve();
    });

    ws.on('message', (data) => {
      stats.messagesReceived++;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'snapshot') stats.snapshotsReceived++;
      } catch {}
    });

    ws.on('close', () => {
      stats.disconnected++;
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      stats.failed++;
      resolve();
    });
  });
}

function printStats(): void {
  const avgConnect =
    stats.connectTimes.length > 0
      ? Math.round(stats.connectTimes.reduce((a, b) => a + b, 0) / stats.connectTimes.length)
      : 0;
  const p95Idx = Math.floor(stats.connectTimes.length * 0.95);
  const sorted = [...stats.connectTimes].sort((a, b) => a - b);
  const p95 = sorted[p95Idx] || 0;

  console.log('\n--- Load Test Results ---');
  console.log(`Target:            ${NUM_CLIENTS} clients → ${WS_URL}`);
  console.log(`Connected:         ${stats.connected}`);
  console.log(`Failed:            ${stats.failed}`);
  console.log(`Disconnected:      ${stats.disconnected}`);
  console.log(`Messages received: ${stats.messagesReceived}`);
  console.log(`Snapshots:         ${stats.snapshotsReceived}`);
  console.log(`Avg connect time:  ${avgConnect}ms`);
  console.log(`P95 connect time:  ${p95}ms`);
  console.log('------------------------\n');
}

async function run() {
  console.log(`Starting load test: ${NUM_CLIENTS} clients, ${DURATION_S}s duration`);
  console.log(`Target: ${WS_URL}\n`);

  // Connect clients in batches of 50 to avoid overwhelming the server
  const BATCH_SIZE = 50;
  const BATCH_DELAY = 100;

  for (let i = 0; i < NUM_CLIENTS; i += BATCH_SIZE) {
    const batch = [];
    const end = Math.min(i + BATCH_SIZE, NUM_CLIENTS);
    for (let j = i; j < end; j++) {
      batch.push(connectClient(j));
    }
    await Promise.all(batch);

    const pct = Math.round((end / NUM_CLIENTS) * 100);
    process.stdout.write(`\rConnecting... ${end}/${NUM_CLIENTS} (${pct}%) — ${stats.failed} failed`);

    if (end < NUM_CLIENTS) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  console.log(`\n\nAll connection attempts complete. Holding for ${DURATION_S}s...`);

  // Hold connections open and collect messages
  const statusInterval = setInterval(() => {
    process.stdout.write(
      `\rActive: ${stats.connected - stats.disconnected} | Messages: ${stats.messagesReceived}   `
    );
  }, 2000);

  await new Promise((r) => setTimeout(r, DURATION_S * 1000));

  clearInterval(statusInterval);

  // Disconnect all clients
  console.log('\n\nDisconnecting clients...');
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  }

  await new Promise((r) => setTimeout(r, 2000));
  printStats();
  process.exit(0);
}

run().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
