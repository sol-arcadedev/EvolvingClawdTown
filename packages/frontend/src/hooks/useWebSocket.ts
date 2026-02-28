import { useEffect, useRef, useCallback } from 'react';
import { WsMessage, WalletState, TownSnapshotMeta } from '../types';
import { useTownStore } from './useTownStore';

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

// Buffer wallet updates and flush as a batch
const WALLET_FLUSH_MS = 200;
let walletBuffer: WalletState[] = [];
let walletFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushWalletBuffer() {
  if (walletBuffer.length === 0) return;
  const batch = walletBuffer;
  walletBuffer = [];
  walletFlushTimer = null;
  useTownStore.getState().applyWalletBatch(batch);
}

function bufferWalletUpdate(wallet: WalletState) {
  walletBuffer.push(wallet);
  if (!walletFlushTimer) {
    walletFlushTimer = setTimeout(flushWalletBuffer, WALLET_FLUSH_MS);
  }
}

// ── Gzip decompression (browser-native DecompressionStream) ────
async function decompressGzip(blob: Blob): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const reader = blob.stream().pipeThrough(ds).getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryMs = useRef(INITIAL_RETRY_MS);
  const retryTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Track pending town_snapshot metadata (JSON arrives first, then binary)
  const pendingTownMeta = useRef<TownSnapshotMeta | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      useTownStore.getState().setConnected(true);
      useTownStore.getState().setReconnecting(false);
      retryMs.current = INITIAL_RETRY_MS;
    };

    ws.onmessage = async (ev) => {
      try {
        // Handle binary frames (gzipped tilemap data)
        if (ev.data instanceof Blob) {
          const meta = pendingTownMeta.current;
          if (meta) {
            pendingTownMeta.current = null;
            const decompressed = await decompressGzip(ev.data);
            console.log(`Town tilemap received: ${decompressed.length} bytes (${meta.width}x${meta.height})`);
            useTownStore.getState().applyTownSnapshot(meta, decompressed);
          } else {
            console.warn('Received binary frame without pending town_snapshot metadata');
          }
          return;
        }

        const msg: WsMessage = JSON.parse(ev.data);

        switch (msg.type) {
          case 'snapshot':
            useTownStore.getState().applySnapshot(msg.wallets, msg.consoleLines, msg.tokenMint);
            break;
          case 'wallet_update':
            bufferWalletUpdate(msg.wallet);
            break;
          case 'trade':
            useTownStore.getState().addTradeEvent(msg.event);
            break;
          case 'console_line':
            useTownStore.getState().addConsoleLine(msg.line);
            break;
          case 'tick':
            break;
          case 'clawd_decision':
            useTownStore.getState().addConsoleLine(`> ${msg.clawdComment}`);
            useTownStore.getState().applyClawdDecision(msg.walletAddress, {
              buildingName: msg.buildingName,
              architecturalStyle: msg.architecturalStyle,
              clawdComment: msg.clawdComment,
            });
            break;
          case 'building_image_update':
            useTownStore.getState().applyBuildingImage(msg.walletAddress, msg.imageUrl);
            break;
          case 'town_snapshot':
            // Store metadata, wait for the binary frame that follows
            pendingTownMeta.current = {
              width: msg.width,
              height: msg.height,
              buildings: msg.buildings,
              seed: msg.seed,
              tilemapSize: msg.tilemapSize,
            };
            break;
          case 'building_placed':
          case 'road_added':
          case 'district_grown':
            // TODO: incremental tilemap updates
            break;
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log(`WebSocket disconnected. Reconnecting in ${retryMs.current}ms...`);
      useTownStore.getState().setConnected(false);
      useTownStore.getState().setReconnecting(true);
      retryTimeout.current = setTimeout(() => {
        retryMs.current = Math.min(retryMs.current * 2, MAX_RETRY_MS);
        connect();
      }, retryMs.current);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(retryTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
