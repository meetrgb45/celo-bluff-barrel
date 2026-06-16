import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

const WS_URL = import.meta.env.VITE_WS_URL ||
  (location.protocol === 'https:' ? 'wss://localhost:8080' : 'ws://localhost:8080');

type HandMessage = { type: 'hand'; gameId: string; round: number; cards: number[]; salt: string; gameRoundId: string };

interface UseWebSocketOptions {
  address?: string;
  onHand?: (msg: HandMessage) => void;
}

export function useWebSocket({ address, onHand }: UseWebSocketOptions = {}) {
  const gameId = useGameStore((s) => s.gameId);
  const wsRef = useRef<WebSocket | null>(null);
  const onHandRef = useRef(onHand);
  onHandRef.current = onHand;

  const sendStateChanged = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stateChanged', from: address }));
    }
  }, [address]);

  const sendEvent = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'event', data }));
    }
  }, []);

  // Re-connect whenever gameId OR address changes so join always includes address
  useEffect(() => {
    if (gameId === null || !address) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', gameId: String(gameId), address }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'hand') {
          onHandRef.current?.(msg as HandMessage);
          return;
        }

        if (msg.type === 'stateChanged' || msg.type === 'spinResolving') {
          window.dispatchEvent(new CustomEvent('ws-state-changed', { detail: msg }));
          return;
        }

        if (msg.type === 'event') {
          window.dispatchEvent(new CustomEvent('ws-game-event', { detail: msg.data }));
        }
      } catch {}
    };

    ws.onclose = () => { wsRef.current = null; };

    return () => { ws.close(); wsRef.current = null; };
  }, [gameId, address]); // re-run when address becomes available

  return { sendStateChanged, sendEvent };
}
