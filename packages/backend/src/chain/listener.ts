import WebSocket from 'ws';
import { GameEvent } from '../game/engine';
import { DB } from '../db/queries';
import { log } from '../utils/logger';

const POLL_BASE_MS = parseInt(process.env.POLL_INTERVAL_MS || '10000');
const POLL_BACKOFF_MS = parseInt(process.env.POLL_BACKOFF_MS || '30000');
const POLL_BACKOFF_AFTER = parseInt(process.env.POLL_BACKOFF_AFTER || '3');

const WS_PING_INTERVAL_MS = 30_000;
const WS_RECONNECT_BASE_MS = 1_000;
const WS_RECONNECT_MAX_MS = 30_000;

const KNOWN_DEX_PROGRAMS = new Set([
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',  // Pump AMM
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM V4
  'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM
]);

interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  mint: string;
}

interface HeliusTransaction {
  signature: string;
  type: string;
  source: string;
  timestamp: number;
  feePayer: string;
  tokenTransfers: HeliusTokenTransfer[];
}

type ListenerMode = 'ws' | 'polling' | 'idle';

export class ChainListener {
  private mintAddress: string;
  private apiKey: string;
  private stopped = false;
  private eventsProcessed = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSignature: string | null = null;
  private active = false;
  private emptyPolls = 0;

  // WebSocket state
  private ws: WebSocket | null = null;
  private wsSubscriptionId: number | null = null;
  private wsPingInterval: ReturnType<typeof setInterval> | null = null;
  private wsReconnectAttempt = 0;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private mode: ListenerMode = 'idle';

  constructor(
    private rpcUrl: string,
    mintAddress: string,
    private db: DB,
    private onEvent: (event: GameEvent) => void
  ) {
    this.mintAddress = mintAddress;
    const match = rpcUrl.match(/api-key=([^&]+)/);
    this.apiKey = match ? match[1] : '';
  }

  async start(): Promise<void> {
    if (this.stopped) return;

    log.info(`Chain listener starting for mint: ${this.mintAddress}`);

    if (!this.apiKey) {
      log.error('Chain listener: could not extract API key from HELIUS_RPC_URL');
      return;
    }

    this.active = true;

    // Try WebSocket first, fall back to polling
    try {
      await this.connectWebSocket();
    } catch (err) {
      log.warn('Chain listener: WebSocket connection failed, falling back to polling', err);
      await this.startPolling();
    }
  }

  // ── WebSocket ───────────────────────────────────────────────────────

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.stopped) return reject(new Error('stopped'));

      const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      const connectTimeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('WebSocket connect timeout'));
      }, 10_000);

      ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.wsReconnectAttempt = 0;
        log.info('Chain listener: WebSocket connected, subscribing...');

        // Subscribe to transactions involving our mint
        const subscribeMsg = {
          jsonrpc: '2.0',
          id: 1,
          method: 'transactionSubscribe',
          params: [
            { accountInclude: [this.mintAddress] },
            {
              commitment: 'confirmed',
              encoding: 'jsonParsed',
              transactionDetails: 'full',
              maxSupportedTransactionVersion: 0,
            },
          ],
        };
        ws.send(JSON.stringify(subscribeMsg));
      });

      let subscribed = false;

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString());

          // Subscription confirmation
          if (msg.id === 1 && msg.result !== undefined) {
            this.wsSubscriptionId = msg.result;
            this.mode = 'ws';
            subscribed = true;
            log.info(`Chain listener active (WebSocket mode), subscription ID: ${msg.result}`);
            resolve();
            return;
          }

          // Subscription error
          if (msg.id === 1 && msg.error) {
            log.error('Chain listener: subscription error', msg.error);
            if (!subscribed) reject(new Error(msg.error.message));
            return;
          }

          // Transaction notification
          if (msg.method === 'transactionNotification' && msg.params?.result) {
            this.handleWsTransaction(msg.params.result);
          }
        } catch (err) {
          log.error('Chain listener: failed to parse WS message', err);
        }
      });

      ws.on('close', (code: number, reason: Buffer) => {
        clearTimeout(connectTimeout);
        log.warn(`Chain listener: WebSocket closed (code=${code}, reason=${reason.toString()})`);
        this.cleanupWs();
        if (!subscribed) {
          reject(new Error(`WebSocket closed before subscribe: ${code}`));
        } else if (!this.stopped) {
          this.handleWsDisconnect();
        }
      });

      ws.on('error', (err: Error) => {
        log.error('Chain listener: WebSocket error', err);
        // 'close' event will fire after this
      });

      // Keep-alive ping
      this.wsPingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, WS_PING_INTERVAL_MS);
    });
  }

  private handleWsTransaction(result: any): void {
    try {
      const tx = this.parseWsTransaction(result);
      if (tx) {
        this.processTransaction(tx);
      }
    } catch (err) {
      log.error('Chain listener: failed to process WS transaction', err);
    }
  }

  private parseWsTransaction(result: any): HeliusTransaction | null {
    const { signature, transaction, meta } = result.transaction || result;
    if (!meta || !transaction) return null;

    const preBalances: any[] = meta.preTokenBalances || [];
    const postBalances: any[] = meta.postTokenBalances || [];

    // Build a map of owner → pre/post uiAmount for our mint
    const balanceMap = new Map<string, { pre: number; post: number }>();

    for (const b of preBalances) {
      if (b.mint !== this.mintAddress) continue;
      const owner = b.owner;
      if (!owner) continue;
      const entry = balanceMap.get(owner) || { pre: 0, post: 0 };
      entry.pre = b.uiTokenAmount?.uiAmount ?? 0;
      balanceMap.set(owner, entry);
    }

    for (const b of postBalances) {
      if (b.mint !== this.mintAddress) continue;
      const owner = b.owner;
      if (!owner) continue;
      const entry = balanceMap.get(owner) || { pre: 0, post: 0 };
      entry.post = b.uiTokenAmount?.uiAmount ?? 0;
      balanceMap.set(owner, entry);
    }

    if (balanceMap.size === 0) return null;

    // Detect if a known DEX program is involved → swap
    const isDexSwap = this.detectDexInvolvement(transaction, meta);

    // Build token transfers from balance diffs
    const tokenTransfers: HeliusTokenTransfer[] = [];
    const owners = Array.from(balanceMap.entries());

    // Find senders (balance decreased) and receivers (balance increased)
    const senders: { owner: string; amount: number }[] = [];
    const receivers: { owner: string; amount: number }[] = [];

    for (const [owner, bal] of owners) {
      const diff = bal.post - bal.pre;
      if (diff < 0) senders.push({ owner, amount: Math.abs(diff) });
      if (diff > 0) receivers.push({ owner, amount: diff });
    }

    // Pair senders with receivers to create transfer records
    for (const sender of senders) {
      for (const receiver of receivers) {
        const amount = Math.min(sender.amount, receiver.amount);
        if (amount > 0) {
          tokenTransfers.push({
            fromUserAccount: sender.owner,
            toUserAccount: receiver.owner,
            tokenAmount: amount,
            mint: this.mintAddress,
          });
          sender.amount -= amount;
          receiver.amount -= amount;
        }
      }
    }

    if (tokenTransfers.length === 0) return null;

    // Determine fee payer
    const accountKeys = transaction.message?.accountKeys || [];
    const feePayer = accountKeys[0]?.pubkey || accountKeys[0] || '';

    return {
      signature,
      type: isDexSwap ? 'SWAP' : 'TRANSFER',
      source: isDexSwap ? 'DEX' : 'SYSTEM',
      timestamp: Math.floor(Date.now() / 1000),
      feePayer: typeof feePayer === 'string' ? feePayer : '',
      tokenTransfers,
    };
  }

  private detectDexInvolvement(transaction: any, meta: any): boolean {
    // Check account keys for known DEX program IDs
    const accountKeys: any[] = transaction.message?.accountKeys || [];
    for (const key of accountKeys) {
      const pubkey = typeof key === 'string' ? key : key?.pubkey;
      if (pubkey && KNOWN_DEX_PROGRAMS.has(pubkey)) return true;
    }

    // Check inner instructions' programId as well
    const innerInstructions: any[] = meta.innerInstructions || [];
    for (const inner of innerInstructions) {
      for (const ix of inner.instructions || []) {
        const pid = ix.programId;
        if (pid && KNOWN_DEX_PROGRAMS.has(pid)) return true;
      }
    }

    // Check top-level instructions
    const instructions: any[] = transaction.message?.instructions || [];
    for (const ix of instructions) {
      const pid = ix.programId;
      if (pid && KNOWN_DEX_PROGRAMS.has(pid)) return true;
    }

    return false;
  }

  private handleWsDisconnect(): void {
    if (this.stopped) return;

    // Fall back to polling while we try to reconnect
    log.info('Chain listener: falling back to polling while reconnecting WebSocket...');
    this.startPolling();

    // Schedule reconnect with exponential backoff
    this.scheduleWsReconnect();
  }

  private scheduleWsReconnect(): void {
    if (this.stopped) return;

    const delay = Math.min(
      WS_RECONNECT_BASE_MS * Math.pow(2, this.wsReconnectAttempt),
      WS_RECONNECT_MAX_MS
    );
    this.wsReconnectAttempt++;

    log.info(`Chain listener: reconnecting WebSocket in ${delay}ms (attempt ${this.wsReconnectAttempt})`);

    this.wsReconnectTimer = setTimeout(async () => {
      if (this.stopped) return;
      try {
        await this.connectWebSocket();
        // WebSocket reconnected — stop polling
        this.stopPolling();
        log.info('Chain listener: WebSocket reconnected, polling stopped');
      } catch {
        log.warn('Chain listener: WebSocket reconnect failed, retrying...');
        this.scheduleWsReconnect();
      }
    }, delay);
  }

  private cleanupWs(): void {
    if (this.wsPingInterval) {
      clearInterval(this.wsPingInterval);
      this.wsPingInterval = null;
    }
    this.wsSubscriptionId = null;
    if (this.mode === 'ws') this.mode = 'idle';
  }

  // ── Polling (fallback) ──────────────────────────────────────────────

  private async startPolling(): Promise<void> {
    if (this.stopped) return;
    if (this.mode === 'polling') return; // already polling

    this.mode = 'polling';
    log.info('Chain listener active (polling mode)');

    // Make sure we have a cursor
    if (!this.lastSignature) {
      await this.initLastSignature();
    }
    this.schedulePoll();
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.emptyPolls = 0;
  }

  private async initLastSignature(): Promise<void> {
    try {
      const txs = await this.fetchTransactions(1);
      if (txs.length > 0) {
        this.lastSignature = txs[0].signature;
        log.info(`Chain listener initialized at signature: ${this.lastSignature.slice(0, 16)}...`);
      }
    } catch (err) {
      log.warn('Chain listener: failed to fetch initial signature, will start from scratch');
    }
  }

  private schedulePoll(): void {
    if (this.stopped || this.mode !== 'polling') return;
    const interval = this.emptyPolls >= POLL_BACKOFF_AFTER ? POLL_BACKOFF_MS : POLL_BASE_MS;
    this.pollTimer = setTimeout(() => this.poll(), interval);
  }

  private async poll(): Promise<void> {
    if (this.stopped || this.mode !== 'polling') return;

    try {
      const txs = await this.fetchTransactions(20);

      const newTxs: HeliusTransaction[] = [];
      for (const tx of txs) {
        if (tx.signature === this.lastSignature) break;
        newTxs.push(tx);
      }

      if (newTxs.length > 0) {
        this.lastSignature = newTxs[0].signature;

        if (this.emptyPolls >= POLL_BACKOFF_AFTER) {
          log.info(`Chain listener: activity detected, resetting to ${POLL_BASE_MS}ms polling`);
        }
        this.emptyPolls = 0;

        for (const tx of newTxs.reverse()) {
          await this.processTransaction(tx);
        }
      } else {
        this.emptyPolls++;
        if (this.emptyPolls === POLL_BACKOFF_AFTER) {
          log.info(`Chain listener: ${POLL_BACKOFF_AFTER} empty polls, backing off to ${POLL_BACKOFF_MS}ms`);
        }
      }
    } catch (err) {
      log.error('Chain listener poll error:', err);
    }

    this.schedulePoll();
  }

  private async fetchTransactions(limit: number): Promise<HeliusTransaction[]> {
    const url = `https://api.helius.xyz/v0/addresses/${this.mintAddress}/transactions?api-key=${this.apiKey}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Helius API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<HeliusTransaction[]>;
  }

  // ── Transaction processing (shared) ─────────────────────────────────

  private async processTransaction(tx: HeliusTransaction): Promise<void> {
    const transfers = tx.tokenTransfers.filter(t => t.mint === this.mintAddress);
    if (transfers.length === 0) return;

    const hasSolMovement = tx.type === 'SWAP' || tx.source === 'PUMP_AMM' || tx.source === 'RAYDIUM' || tx.source === 'DEX';

    for (const transfer of transfers) {
      if (transfer.fromUserAccount && transfer.fromUserAccount !== this.mintAddress) {
        await this.emitEvent(
          transfer.fromUserAccount,
          transfer.tokenAmount,
          false,
          hasSolMovement,
          tx.signature,
          tx.timestamp
        );
      }

      if (transfer.toUserAccount && transfer.toUserAccount !== this.mintAddress) {
        await this.emitEvent(
          transfer.toUserAccount,
          transfer.tokenAmount,
          true,
          hasSolMovement,
          tx.signature,
          tx.timestamp
        );
      }
    }
  }

  private async emitEvent(
    walletAddress: string,
    tokenAmount: number,
    isIncrease: boolean,
    hasSolMovement: boolean,
    txSignature: string,
    timestamp: number
  ): Promise<void> {
    const wallet = await this.db.getWallet(walletAddress);
    const previousBalance = wallet ? BigInt(wallet.token_balance) : 0n;

    const rawAmount = BigInt(Math.round(tokenAmount * 1e6));
    const newBalance = isIncrease
      ? previousBalance + rawAmount
      : previousBalance > rawAmount ? previousBalance - rawAmount : 0n;

    if (previousBalance === newBalance) return;

    const eventType: 'buy' | 'sell' = isIncrease ? 'buy' : 'sell';

    const delta = newBalance - previousBalance;

    const gameEvent: GameEvent = {
      type: eventType,
      walletAddress,
      tokenAmountDelta: delta,
      previousBalance,
      newBalance,
      txSignature: `${txSignature}-${walletAddress.slice(0, 8)}`,
      solAmount: null,
      timestamp: new Date(timestamp * 1000),
    };

    this.eventsProcessed++;
    this.onEvent(gameEvent);
  }

  // ── Stats & lifecycle ───────────────────────────────────────────────

  getStats(): { subscriptionId: number | null; eventsProcessed: number; mode: ListenerMode } {
    return {
      subscriptionId: this.wsSubscriptionId,
      eventsProcessed: this.eventsProcessed,
      mode: this.mode,
    };
  }

  stop(): void {
    this.stopped = true;

    // Clean up WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanupWs();

    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    // Clean up polling
    this.stopPolling();

    this.active = false;
    this.mode = 'idle';
    log.info('Chain listener stopped');
  }
}
