import { useCallback } from 'react';
import { useWriteContract } from 'wagmi';
import { GAME_ADDRESS, GAME_ABI } from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';

/**
 * Spin resolution is handled by the WS server (calls revolver.resolveSpin).
 * This hook only exposes:
 *  - useDoubleSpin(): opt into double spin before server resolves
 *  - forceTimeout(): any player can call after deadline
 */
export function useSpin() {
  const { writeContractAsync, isPending } = useWriteContract();
  const gameId = useGameStore((s) => s.gameId);

  const useDoubleSpin = useCallback(async () => {
    if (gameId === null) return;
    await writeContractAsync({
      address: GAME_ADDRESS,
      abi: GAME_ABI,
      functionName: 'useDoubleSpin',
      args: [BigInt(gameId)],
    });
  }, [gameId, writeContractAsync]);

  const forceTimeout = useCallback(async () => {
    if (gameId === null) return;
    await writeContractAsync({
      address: GAME_ADDRESS,
      abi: GAME_ABI,
      functionName: 'forceTimeout',
      args: [BigInt(gameId)],
    });
  }, [gameId, writeContractAsync]);

  return { useDoubleSpin, forceTimeout, isPending };
}
