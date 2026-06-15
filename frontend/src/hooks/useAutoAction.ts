import { useEffect, useRef } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useGameStore } from '../stores/gameStore';
import { GAME_ADDRESS, GAME_ABI } from '../lib/contracts';

/**
 * Auto-acts 55s after a turn starts (before 90s contract timeout).
 * On PlayerTurn: plays first unplayed card.
 * Server handles spin resolution; no auto-action needed for Spinning state.
 */
export function useAutoAction() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const gameId = useGameStore((s) => s.gameId);
  const state = useGameStore((s) => s.state);
  const players = useGameStore((s) => s.players);
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const markCardsPlayed = useGameStore((s) => s.markCardsPlayed);
  const autoActedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMyTurn = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();

  useEffect(() => {
    autoActedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [state, currentTurnIndex]);

  useEffect(() => {
    if (!publicClient || gameId === null || !address) return;
    if (state !== 'PlayerTurn' || !isMyTurn) return;
    if (autoActedRef.current) return;

    timerRef.current = setTimeout(async () => {
      if (autoActedRef.current) return;
      autoActedRef.current = true;
      try {
        const { playedCards } = useGameStore.getState();
        const unplayed = [0, 1, 2, 3, 4].find((i) => !playedCards.includes(i));
        if (unplayed !== undefined) {
          await writeContractAsync({
            address: GAME_ADDRESS, abi: GAME_ABI,
            functionName: 'playCards', args: [BigInt(gameId), [unplayed]],
          });
          markCardsPlayed([unplayed]);
        }
      } catch (e) { console.error('[autoAction]', e); }
    }, 55_000);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, isMyTurn, gameId, address, publicClient, writeContractAsync, markCardsPlayed]);
}
