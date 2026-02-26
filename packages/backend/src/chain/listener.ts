import { GameEvent } from '../game/engine';
import { DB } from '../db/queries';
import { log } from '../utils/logger';

const POLL_INTERVAL_MS = 5000; // poll every 5 seconds

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

export class ChainListener {
  private mintAddress: string;
  private apiKey: string;
  private stopped = false;
  private eventsProcessed = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSignature: string | null = null;
  private active = false;

  constructor(
    private rpcUrl: string,
    mintAddress: string,
    private db: DB,
    private onEvent: (event: GameEvent) => void
  ) {
    this.mintAddress = mintAddress;
    // Extract API key from RPC URL
    const match = rpcUrl.match(/api-key=([^&]+)/);
    this.apiKey = match ? match[1] : '';
  }

  async start(): Promise<void> {
    if (this.stopped) return;

    log.info(`Chain listener starting for mint: ${this.mintAddress} (polling mode)`);

    if (!this.apiKey) {
      log.error('Chain listener: could not extract API key from HELIUS_RPC_URL');
      return;
    }

    this.active = true;
    // Fetch the latest transaction signature so we only process new ones
    await this.initLastSignature();
    this.schedulePoll();

    log.info('Chain listener active (polling Helius Enhanced API)');
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
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;

    try {
      const txs = await this.fetchTransactions(20);

      // Find new transactions (everything before lastSignature)
      const newTxs: HeliusTransaction[] = [];
      for (const tx of txs) {
        if (tx.signature === this.lastSignature) break;
        newTxs.push(tx);
      }

      if (newTxs.length > 0) {
        // Update cursor to most recent
        this.lastSignature = newTxs[0].signature;

        // Process oldest first
        for (const tx of newTxs.reverse()) {
          await this.processTransaction(tx);
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

  private async processTransaction(tx: HeliusTransaction): Promise<void> {
    // Find token transfers involving our mint
    const transfers = tx.tokenTransfers.filter(t => t.mint === this.mintAddress);
    if (transfers.length === 0) return;

    // Determine if it's a swap (has SOL movement) = buy/sell
    const hasSolMovement = tx.type === 'SWAP' || tx.source === 'PUMP_AMM' || tx.source === 'RAYDIUM';

    for (const transfer of transfers) {
      // The sender's balance decreased (sell side)
      if (transfer.fromUserAccount && transfer.fromUserAccount !== this.mintAddress) {
        await this.emitEvent(
          transfer.fromUserAccount,
          transfer.tokenAmount,
          false, // balance decreased
          hasSolMovement,
          tx.signature,
          tx.timestamp
        );
      }

      // The receiver's balance increased (buy side)
      if (transfer.toUserAccount && transfer.toUserAccount !== this.mintAddress) {
        await this.emitEvent(
          transfer.toUserAccount,
          transfer.tokenAmount,
          true, // balance increased
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
    // Skip AMM/pool addresses (they're not real holders)
    // Pool addresses typically hold large amounts and are program-owned
    const wallet = await this.db.getWallet(walletAddress);
    const previousBalance = wallet ? BigInt(wallet.token_balance) : 0n;

    // Convert decimal token amount to raw integer (6 decimals for most SPL tokens)
    const rawAmount = BigInt(Math.round(tokenAmount * 1e6));
    const newBalance = isIncrease
      ? previousBalance + rawAmount
      : previousBalance > rawAmount ? previousBalance - rawAmount : 0n;

    if (previousBalance === newBalance) return;

    const eventType = isIncrease
      ? (hasSolMovement ? 'buy' : 'transfer_in')
      : (hasSolMovement ? 'sell' : 'transfer_out');

    const delta = newBalance - previousBalance;

    const gameEvent: GameEvent = {
      type: eventType as 'buy' | 'sell' | 'transfer_in' | 'transfer_out',
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

  getStats(): { subscriptionId: number | null; eventsProcessed: number } {
    return {
      subscriptionId: this.active ? 1 : null,
      eventsProcessed: this.eventsProcessed,
    };
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.active = false;
    log.info('Chain listener stopped');
  }
}
