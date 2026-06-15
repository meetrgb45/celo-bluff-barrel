import { useCallback } from 'react';
import { useWriteContract } from 'wagmi';
import { GAME_ADDRESS, GAME_ABI } from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';

/**
 * Calls revealChallenge() when this player is the accused (lastClaimant).
 * Hand values and salt were received from WS server and stored in gameStore.
 */
export function useChallenge() {
  const { writeContractAsync, isPending } = useWriteContract();
  const myHand = useGameStore((s) => s.myHand);
  const myHandSalt = useGameStore((s) => s.myHandSalt);
  const gameId = useGameStore((s) => s.gameId);

  const revealChallenge = useCallback(async () => {
    if (gameId === null || !myHandSalt) return;
    // Hand must be fully known (all 5 values)
    if (myHand.some((v) => v === null)) {
      console.error('[useChallenge] hand not fully received yet');
      return;
    }

    const cardValues = myHand as number[];

    await writeContractAsync({
      address: GAME_ADDRESS,
      abi: GAME_ABI,
      functionName: 'revealChallenge',
      args: [
        BigInt(gameId),
        cardValues as [number, number, number, number, number],
        myHandSalt as `0x${string}`,
      ],
    });
  }, [gameId, myHand, myHandSalt, writeContractAsync]);

  return { revealChallenge, isPending };
}
