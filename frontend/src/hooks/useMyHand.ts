import { useCallback } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { keccak256, encodePacked } from 'viem';
import { DECK_ADDRESS, DECK_ABI } from '../lib/contracts';
import { useGameStore } from '../stores/gameStore';

/**
 * Receives hand from WS server message { type: 'hand', cards, salt, gameRoundId }
 * Stores cards + salt in Zustand, then auto-commits the hand on-chain.
 *
 * Commitment: keccak256(abi.encodePacked(c0,c1,c2,c3,c4, salt))
 * Must match LiarsBarDeck.verifyClaim's hashing exactly.
 */
export function useMyHand() {
  const { address } = useAccount();
  const gameId = useGameStore((s) => s.gameId);
  const setMyHand = useGameStore((s) => s.setMyHand);
  const { writeContractAsync } = useWriteContract();

  const receiveHand = useCallback(async (cards: number[], salt: string, gameRoundId: string) => {
    if (!address) return;

    // Store in Zustand immediately so UI can render cards
    setMyHand(cards, salt);

    // Build commitment matching Solidity: keccak256(abi.encodePacked(uint8 x5, bytes32))
    const commitment = keccak256(encodePacked(
      ['uint8', 'uint8', 'uint8', 'uint8', 'uint8', 'bytes32'],
      [cards[0], cards[1], cards[2], cards[3], cards[4], salt as `0x${string}`]
    ));

    try {
      await writeContractAsync({
        address: DECK_ADDRESS,
        abi: DECK_ABI,
        functionName: 'commitHand',
        args: [BigInt(gameRoundId), commitment],
      });
      console.log('[useMyHand] committed hand', commitment.slice(0, 10));
    } catch (err: any) {
      // Already committed (e.g. reconnect) — not an error
      if (!err?.message?.includes('Already committed')) {
        console.error('[useMyHand] commitHand failed:', err?.message);
      }
    }
  }, [address, setMyHand, writeContractAsync]);

  return { receiveHand };
}
