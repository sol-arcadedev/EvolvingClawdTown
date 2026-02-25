import { useEffect, useRef, useCallback } from 'react';
import { WsMessage } from '../types';
import { useTownStore } from './useTownStore';

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryMs = useRef(INITIAL_RETRY_MS);
  const retryTimeout = useRef<ReturnType<typeof setTimeout>>();

  const { applySnapshot, applyWalletUpdate, addTradeEvent, setConnected } =
    useTownStore.getState();

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
            useTownStore.getState().applySnapshot(msg.wallets, msg.consoleLines);
            break;
          case 'wallet_update':
            useTownStore.getState().applyWalletUpdate(msg.wallet);
            break;
          case 'trade':
            useTownStore.getState().addTradeEvent(msg.event);
            break;
          case 'console_line':
            useTownStore.getState().addConsoleLine(msg.line);
            break;
          case 'tick':
            // Tick events can trigger visual pulse — handled by PixiJS subscriber
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
