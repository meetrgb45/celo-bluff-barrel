import { useGameStore } from '../../stores/gameStore';

export default function RevolverWheel() {
  const chamberPointer = useGameStore((s) => s.chamberPointer);
  const state = useGameStore((s) => s.state);

  if (state === 'WaitingForPlayers') return null;

  const chambers = Array.from({ length: 6 }, (_, i) => i < chamberPointer);

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 mr-1">🔫</span>
      {chambers.map((used, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full border ${used ? 'bg-bar-danger border-red-400' : 'bg-gray-700 border-gray-500'}`}
          title={`Chamber ${i + 1}${used ? ' (fired)' : ''}`}
        />
      ))}
    </div>
  );
}
