import { useAccount } from 'wagmi';
import { useGameStore } from '../../stores/gameStore';
import { shortenAddress } from '../../lib/cardUtils';
import type { PlayerInfo } from '../../stores/gameStore';

export default function PlayerSeat({ player, index }: { player: PlayerInfo; index: number }) {
  const { address } = useAccount();
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const chamberPointers = useGameStore((s) => s.chamberPointers);
  const isMe = player.addr?.toLowerCase() === address?.toLowerCase();
  const isTurn = index === currentTurnIndex;
  const isEmpty = player.addr === '0x0000000000000000000000000000000000000000';
  const chambers = chamberPointers[player.addr?.toLowerCase()] || 0;

  if (isEmpty) return (
    <div className="bg-bar-panel/50 border border-dashed border-gray-600 rounded-xl p-4 text-center text-gray-500">
      Empty Seat
    </div>
  );

  return (
    <div className={`bg-bar-panel rounded-xl p-4 border-2 transition-all ${isTurn ? 'border-bar-gold shadow-lg shadow-bar-gold/20' : 'border-transparent'} ${!player.alive ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-mono">{isMe ? '👤 You' : shortenAddress(player.addr)}</span>
        {!player.alive && <span className="text-red-500 text-xs">💀 DEAD</span>}
      </div>
      <div className="flex items-center gap-2 mb-2">
        {!player.alive && <span className="text-red-500 text-xs">💀 DEAD</span>}
      </div>
      {/* Per-player revolver */}
      {player.alive && (
        <div className="flex items-center gap-1">
          <span className="text-xs">🔫</span>
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full border ${i < chambers ? 'bg-bar-danger border-red-400' : 'bg-gray-700 border-gray-500'}`}
            />
          ))}
        </div>
      )}
      {isTurn && player.alive && <div className="mt-1 text-xs text-bar-gold animate-pulse">← Turn</div>}
    </div>
  );
}
