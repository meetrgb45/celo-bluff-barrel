import { useGameStore } from '../../stores/gameStore';
import { targetName } from '../../lib/cardUtils';

export default function TargetCard() {
  const targetCard = useGameStore((s) => s.targetCard);
  const round = useGameStore((s) => s.round);
  const state = useGameStore((s) => s.state);

  if (state === 'WaitingForPlayers' || state === 'GameOver') return null;

  return (
    <div className="text-center">
      <span className="text-xs text-gray-400">Round {round} • Target:</span>
      <div className="text-2xl font-bold text-bar-gold">{targetName(targetCard)}</div>
    </div>
  );
}
