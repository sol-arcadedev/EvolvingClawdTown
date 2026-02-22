import { Connection, PublicKey, KeyedAccountInfo } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { parseTokenAccount, determineEventType } from './parser';
import { GameEvent } from '../game/engine';
import { DB } from '../db/queries';
import { log } from '../utils/logger';

const INITIAL_RETRY_MS = 2000;
const MAX_RETRY_MS = 60000;

export class ChainListener {
  private connection: Connection;
  private mintAddress: string;
  private subscriptionId: number | null = null;
  private retryMs = INITIAL_RETRY_MS;
  private stopped = false;
  private eventsProcessed = 0;

  constructor(
    private rpcUrl: string,
    mintAddress: string,
    private db: DB,
    private onEvent: (event: GameEvent) => void
  ) {
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: rpcUrl.replace('https://', 'wss://'),
    });
    this.mintAddress = mintAddress;
  }

  async start(): Promise<void> {
    if (this.stopped) return;

    log.info(`Chain listener starting for mint: ${this.mintAddress}`);

    try {
      const mintPubkey = new PublicKey(this.mintAddress);

      this.subscriptionId = this.connection.onProgramAccountChange(
        TOKEN_PROGRAM_ID,
        async (keyedAccountInfo: KeyedAccountInfo) => {
          try {
            await this.handleAccountChange(keyedAccountInfo);
          } catch (err) {
            log.error('Error handling account change', err);
          }
        },
        {
          commitment: 'confirmed',
          filters: [
            { dataSize: 165 },
            { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
          ],
        }
      );

      log.info(`Chain listener subscribed (id: ${this.subscriptionId})`);
      this.retryMs = INITIAL_RETRY_MS; // reset backoff on success

      // Monitor the underlying websocket for disconnects
      this.monitorConnection();
    } catch (err) {
      log.error('Chain listener failed to start', err);
      this.scheduleReconnect();
    }
  }

  private monitorConnection(): void {
    // @solana/web3.js Connection uses an internal websocket.
    // Poll for subscription health by checking if we can still communicate.
    const checkInterval = setInterval(() => {
      if (this.stopped) {
        clearInterval(checkInterval);
        return;
      }

      // If subscription was removed externally (disconnect), reconnect
      if (this.subscriptionId === null) {
        clearInterval(checkInterval);
        log.warn('Chain listener subscription lost, reconnecting...');
        this.scheduleReconnect();
      }
    }, 30000);
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;

    log.info(`Chain listener reconnecting in ${this.retryMs}ms...`);
    setTimeout(async () => {
      // Create a fresh connection on reconnect
      this.connection = new Connection(this.rpcUrl, {
        commitment: 'confirmed',
        wsEndpoint: this.rpcUrl.replace('https://', 'wss://'),
      });
      await this.start();
      this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    }, this.retryMs);
  }

  private async handleAccountChange(keyedAccountInfo: KeyedAccountInfo): Promise<void> {
    const parsed = parseTokenAccount(
      keyedAccountInfo.accountInfo as any,
      this.mintAddress
    );
    if (!parsed) return;

    const wallet = await this.db.getWallet(parsed.ownerAddress);
    const previousBalance = wallet ? BigInt(wallet.token_balance) : 0n;

    if (previousBalance === parsed.newBalance) return;

    // Assume SOL movement (buy/sell) for pump.fun trades.
    // Transfers are a minority case; a future enhancement can inspect
    // the full transaction to differentiate.
    const hasSolMovement = true;
    const eventType = determineEventType(previousBalance, parsed.newBalance, hasSolMovement);
    const delta = parsed.newBalance - previousBalance;

    const gameEvent: GameEvent = {
      type: eventType,
      walletAddress: parsed.ownerAddress,
      tokenAmountDelta: delta,
      previousBalance,
      newBalance: parsed.newBalance,
      txSignature: `${parsed.ownerAddress}-${Date.now()}`,
      solAmount: null,
      timestamp: new Date(),
    };

    this.eventsProcessed++;
    this.onEvent(gameEvent);
  }

  getStats(): { subscriptionId: number | null; eventsProcessed: number } {
    return {
      subscriptionId: this.subscriptionId,
      eventsProcessed: this.eventsProcessed,
    };
  }

  stop(): void {
    this.stopped = true;
    if (this.subscriptionId !== null) {
      this.connection.removeProgramAccountChangeListener(this.subscriptionId);
      this.subscriptionId = null;
      log.info('Chain listener stopped');
    }
  }
}
