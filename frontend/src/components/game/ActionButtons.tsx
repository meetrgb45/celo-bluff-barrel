import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useGameStore } from '../../stores/gameStore';
import { GAME_ADDRESS, GAME_ABI } from '../../lib/contracts';
import { targetName } from '../../lib/cardUtils';
import { getGasOverrides } from '../../lib/gas';

export default function ActionButtons({ gameId }: { gameId: string }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const state = useGameStore((s) => s.state);
  const players = useGameStore((s) => s.players);
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const markCardsPlayed = useGameStore((s) => s.markCardsPlayed);
  const lastClaimant = useGameStore((s) => s.lastClaimant);
  const targetCard = useGameStore((s) => s.targetCard);

  const isMyTurn = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();
  const hasClaimToChallenge = lastClaimant && lastClaimant !== '0x0000000000000000000000000000000000000000' && lastClaimant.toLowerCase() !== address?.toLowerCase();

  if (state !== 'PlayerTurn' || !isMyTurn) return null;

  const playedCount = useGameStore.getState().playedCards.length;
  const hasCardsLeft = playedCount < 5;

  const playCards = async () => {
    if (selectedCards.length === 0) return;
    const gas = await getGasOverrides(publicClient!);
    await writeContractAsync({
      address: GAME_ADDRESS, abi: GAME_ABI, functionName: 'playCards',
      args: [BigInt(gameId), selectedCards.map((i) => i)], ...gas,
    });
    markCardsPlayed(selectedCards);
  };

  const callLiar = async () => {
    const gas = await getGasOverrides(publicClient!);
    await writeContractAsync({
      address: GAME_ADDRESS, abi: GAME_ABI, functionName: 'callLiar', args: [BigInt(gameId)], ...gas,
    });
  };

  return (
    <div className="bg-bar-panel rounded-xl p-4 flex flex-wrap gap-3 justify-center">
      {hasCardsLeft && (
        <button
          onClick={playCards}
          disabled={selectedCards.length === 0}
          className="px-6 py-3 bg-blue-600 font-bold rounded-lg hover:bg-blue-500 disabled:opacity-40 transition"
        >
          🃏 Play {selectedCards.length} as {targetName(targetCard)}
        </button>
      )}

      {!hasCardsLeft && !hasClaimToChallenge && (
        <p className="text-yellow-400 text-sm">Waiting for someone to play cards...</p>
      )}

      {hasClaimToChallenge && (
        <button
          onClick={callLiar}
          className="px-6 py-3 bg-bar-danger font-bold rounded-lg hover:bg-red-500 transition"
        >
          🤥 CALL LIAR!
        </button>
      )}

      {!hasCardsLeft && hasClaimToChallenge && (
        <p className="text-xs text-gray-400">No cards left — you must call liar!</p>
      )}
    </div>
  );
}
