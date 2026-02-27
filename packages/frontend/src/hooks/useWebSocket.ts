import { useEffect, useRef, useCallback } from 'react';
import { WsMessage, WalletState } from '../types';
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

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryMs = useRef(INITIAL_RETRY_MS);
  const retryTimeout = useRef<ReturnType<typeof setTimeout>>();

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

    ws.onmessage = (ev) => {
      try {
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
